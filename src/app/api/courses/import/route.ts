import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { JsonNull, prisma } from "@/lib/db";
import { parseDocx, formatDocumentForAI } from "@/lib/docx-parser";
import { isMarkdownFile, prepareMarkdownForImport } from "@/lib/markdown-parser";
import { analyzeCourseDocument, type ImportedCourseData } from "@/lib/ai-course-import";
import { getLlm, type LlmProvider } from "@/lib/llm";
import { uploadBlob, isBlobConfigured } from "@/lib/blob";


const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const DOCX_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

function isDocxFile(file: File): boolean {
  return DOCX_TYPES.includes(file.type) || file.name.toLowerCase().endsWith(".docx");
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    
    // Handle JSON body (when creating from preview data)
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const importData = body.importData as ImportedCourseData;
      
      if (!importData) {
        return NextResponse.json({ error: "importData is required" }, { status: 400 });
      }
      
      const course = await createCourseFromImport(importData);
      return NextResponse.json({ course });
    }
    
    // Handle FormData (file upload for preview)
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const apiKey = formData.get("apiKey") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const markdown = isMarkdownFile(file);
    if (!markdown && !isDocxFile(file)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a .docx or .md file." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 10MB, your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.` },
        { status: 400 }
      );
    }

    // A pasted key is treated as an OpenAI key, as before; otherwise the
    // app's provider choice applies. Import calls use the provider's long
    // "import" timeouts with no retries (see src/lib/llm).
    let llm: LlmProvider;
    try {
      llm = await getLlm(apiKey?.trim() ? { aiProvider: "openai-api", apiKeys: { openai: apiKey } } : null);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "No AI provider is set up." },
        { status: 503 }
      );
    }

    let documentContent: string;

    if (markdown) {
      const raw = await file.text();
      documentContent = prepareMarkdownForImport(raw);
    } else {
      documentContent = await prepareDocxForImport(file);
    }

    const importedData = await analyzeCourseDocument(llm, documentContent);

    return NextResponse.json({ preview: importedData });
  } catch (e) {
    console.error("Import error:", e);
    const message = e instanceof Error ? e.message : "Import failed";
    const timedOut = /timed?\s*out|timeout/i.test(message);
    return NextResponse.json({ error: message }, { status: timedOut ? 504 : 500 });
  }
}

async function prepareDocxForImport(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const parsedDoc = await parseDocx(arrayBuffer);
  let documentContent = formatDocumentForAI(parsedDoc);

  // Replace DOCX image tokens with explicit URL markers for the AI.
  // This preserves image positions while allowing separate image blocks.
  const tokenToMarker = new Map<string, string>();
  for (const img of parsedDoc.images ?? []) {
    const safeAlt = (img.alt || "").replaceAll('"', "&quot;").replaceAll("\n", " ").trim();

    const imgContentType = img.contentType && img.contentType.startsWith("image/")
      ? img.contentType
      : "image/png";

    if (!img.base64) {
      const alt = safeAlt || "Image failed to import: empty image data";
      tokenToMarker.set(img.token, `[[IMAGE url="" alt="${alt}"]]`);
      continue;
    }

    // If blob upload isn't configured, fall back to a data URL so the image still appears.
    // (SCORM packaging will bundle data: images into the zip.)
    if (!isBlobConfigured()) {
      const dataUrl = `data:${imgContentType};base64,${img.base64}`;
      const alt = safeAlt || "Imported image";
      tokenToMarker.set(img.token, `[[IMAGE url="${dataUrl}" alt="${alt.replaceAll('"', "&quot;")}"]]`);
      continue;
    }

    try {
      const ext = imgContentType.split("/")[1] || "png";
      const buffer = Buffer.from(img.base64, "base64");
      const filename = `docx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const pathname = `media/${filename}`;

      const { url } = await uploadBlob(pathname, buffer, { contentType: imgContentType });

      const media = await prisma.media.create({
        data: {
          url,
          filename,
          mimeType: imgContentType,
          size: buffer.length,
          alt: safeAlt || null,
          source: "upload",
        },
      });

      const alt = safeAlt || media.filename;
      tokenToMarker.set(img.token, `[[IMAGE url="${media.url}" alt="${alt.replaceAll('"', "&quot;")}"]]`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "upload failed";
      // If upload fails, fall back to a data URL so the image still appears.
      const dataUrl = `data:${imgContentType};base64,${img.base64}`;
      const alt = safeAlt || `Imported image (upload failed: ${reason})`;
      tokenToMarker.set(img.token, `[[IMAGE url="${dataUrl}" alt="${alt.replaceAll('"', "&quot;").replaceAll("\n", " ").trim()}"]]`);
    }
  }

  if (tokenToMarker.size > 0) {
    documentContent = documentContent.replace(/\[\[IMAGE_TOKEN:([^\]]+)\]\]/g, (m, token) => {
      const replacement = tokenToMarker.get(String(token));
      return replacement || m;
    });
  }

  return documentContent;
}

async function createCourseFromImport(data: ImportedCourseData) {
  const course = await prisma.course.create({
    data: {
      title: data.title,
      overview: data.overview || null,
      audience: data.audience || null,
      tone: data.tone || null,
      ilos: data.ilos.length > 0 ? (data.ilos as Prisma.InputJsonValue) : JsonNull,
      assessmentPlan: data.assessmentPlan ? (data.assessmentPlan as Prisma.InputJsonValue) : JsonNull,
      // Marks the course as imported, so the build stages stop steering the
      // author towards generating over content they already have.
      settings: { source: "document" },
    },
  });

  try {
    for (let moduleIdx = 0; moduleIdx < data.modules.length; moduleIdx++) {
      const moduleData = data.modules[moduleIdx];
      const moduleRecord = await prisma.module.create({
        data: {
          courseId: course.id,
          title: moduleData.title,
          order: moduleIdx,
        },
      });

      for (let lessonIdx = 0; lessonIdx < moduleData.lessons.length; lessonIdx++) {
        const lessonData = moduleData.lessons[lessonIdx];
        const lessonRecord = await prisma.lesson.create({
          data: {
            moduleId: moduleRecord.id,
            title: lessonData.title,
            order: lessonIdx,
          },
        });

        for (let pageIdx = 0; pageIdx < lessonData.pages.length; pageIdx++) {
          const pageData = lessonData.pages[pageIdx];
          const pageRecord = await prisma.page.create({
            data: {
              lessonId: lessonRecord.id,
              title: pageData.title,
              order: pageIdx,
            },
          });

          if (pageData.blocks.length > 0) {
            await prisma.block.createMany({
              data: pageData.blocks.map((blockData, blockIdx) => ({
                pageId: pageRecord.id,
                category: blockData.category,
                type: blockData.type,
                data: blockData.data as Prisma.InputJsonValue,
                order: blockIdx,
              })),
            });
          }
        }
      }
    }

    return course;
  } catch (error) {
    await prisma.course.delete({ where: { id: course.id } }).catch(() => {});
    throw error;
  }
}
