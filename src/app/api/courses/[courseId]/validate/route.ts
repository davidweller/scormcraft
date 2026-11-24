import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchStored } from "@/lib/blob";

const WORDS_PER_MINUTE = 200;

function wordCount(text: string): number {
  return text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
}

function extractUrls(content: unknown): string[] {
  if (!content || typeof content !== "object") return [];
  const urls: string[] = [];
  const rec = (obj: unknown) => {
    if (typeof obj === "string") {
      const href = obj.match(/https?:\/\/[^\s"'<>]+/g);
      if (href) urls.push(...href);
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach(rec);
      return;
    }
    if (typeof obj === "object" && obj !== null) {
      Object.values(obj).forEach(rec);
    }
  };
  rec(content);
  return Array.from(new Set(urls));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              orderBy: { order: "asc" },
              include: {
                pages: {
                  orderBy: { order: "asc" },
                  include: {
                    blocks: { orderBy: { order: "asc" } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const ilos = (course.ilos as string[] | null) ?? [];
    let totalWords = 0;
    const accessibility: { type: string; message: string; pageId?: string }[] = [];
    const brokenLinks: { url: string; pageId?: string }[] = [];
    const contentByPage: Record<string, string> = {};

    for (const mod of course.modules ?? []) {
      for (const lesson of mod.lessons ?? []) {
        for (const page of lesson.pages ?? []) {
          let pageText = "";
          for (const block of page.blocks ?? []) {
            const data = block.data as Record<string, unknown> | null;
            if (!data) continue;
            
            if (block.category === "content") {
              if (block.type === "text" && typeof data.text === "string") {
                pageText += " " + data.text;
              }
              if (block.type === "heading" && typeof data.text === "string") {
                pageText += " " + data.text;
              }
              if (block.type === "image") {
                if (!data.alt || typeof data.alt !== "string" || !data.alt.trim()) {
                  accessibility.push({ type: "image", message: "Image missing alt text", pageId: page.id });
                }
              }
              const urls = extractUrls(data);
              for (const url of urls) {
                brokenLinks.push({ url, pageId: page.id });
              }
            } else if (block.category === "interaction") {
              if (typeof data.question === "string") pageText += " " + data.question;
              if (typeof data.prompt === "string") pageText += " " + data.prompt;
              if (Array.isArray(data.options)) {
                data.options.forEach((o) => {
                  if (typeof o === "string") pageText += " " + o;
                });
              }
            }
          }
          contentByPage[page.id] = pageText;
          totalWords += wordCount(pageText);
        }
      }
    }

    const readingTimeMinutes = Math.max(0, Math.ceil(totalWords / WORDS_PER_MINUTE));

    const fullText = Object.values(contentByPage).join(" ");
    const coverage = ilos.map((ilo, index) => {
      const words = ilo.split(/\s+/).filter((w) => w.length > 3);
      const matched = words.filter((w) => fullText.toLowerCase().includes(w.toLowerCase())).length;
      const ratio = words.length ? matched / words.length : 0;
      return {
        iloIndex: index,
        ilo: ilo.slice(0, 80) + (ilo.length > 80 ? "…" : ""),
        covered: ratio >= 0.3,
        notes: ratio < 0.3 ? "Low coverage in content" : "Referenced in content",
      };
    });

    for (const mod of course.modules ?? []) {
      for (const lesson of mod.lessons ?? []) {
        for (const page of lesson.pages ?? []) {
          let prevLevel = 0;
          for (const block of page.blocks ?? []) {
            if (block.category === "content" && block.type === "heading") {
              const level = (block.data as { level?: number })?.level ?? 1;
              if (level > prevLevel + 1) {
                accessibility.push({
                  type: "heading",
                  message: `Heading level ${level} after ${prevLevel} (skip detected)`,
                  pageId: page.id,
                });
              }
              prevLevel = level;
            }
          }
        }
      }
    }

    const linkCheckPromises = brokenLinks.slice(0, 20).map(async (item) => {
      try {
        const res = await fetchStored(item.url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        return { ...item, ok: res.ok };
      } catch {
        return { ...item, ok: false };
      }
    });
    const linkResults = await Promise.all(linkCheckPromises);
    const failedLinks = linkResults.filter((r) => !r.ok).map(({ url, pageId }) => ({ url, pageId }));

    return NextResponse.json({
      readingTimeMinutes,
      totalWords,
      coverage,
      accessibility,
      brokenLinks: failedLinks,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}
