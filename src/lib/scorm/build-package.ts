import JSZip from "jszip";
import { buildManifest12, type PageEntry } from "./manifest";
import { SCORM_API_JS } from "./scorm-api-js";
import {
  renderPageHtml,
  type ScormRuntimeOptions,
  type GradingKey,
} from "./render-page-html";
import type { BrandConfig } from "@/types/branding";

interface ImageMapping {
  originalUrl: string;
  localPath: string;
}

interface VideoMapping {
  originalUrl: string;
  localPath: string;
}

interface FileToBundle {
  url: string;
  localPath: string;
}

async function fetchAndBundleImage(
  url: string,
  index: number,
  contentFolder: JSZip
): Promise<ImageMapping | null> {
  try {
    // Support data URLs (used as fallback when blob upload isn't configured).
    const dataUrlMatch = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrlMatch) {
      const contentType = dataUrlMatch[1].toLowerCase();
      const base64Data = dataUrlMatch[2];
      const buf = Buffer.from(base64Data, "base64");

      let ext = "png";
      if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
      else if (contentType.includes("gif")) ext = "gif";
      else if (contentType.includes("webp")) ext = "webp";
      else if (contentType.includes("svg")) ext = "svg";

      const filename = `img_${index}.${ext}`;
      contentFolder.file(filename, buf);
      return { originalUrl: url, localPath: filename };
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "";
    let ext = "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg") || url.match(/\.jpe?g/i)) {
      ext = "jpg";
    } else if (contentType.includes("gif") || url.match(/\.gif/i)) {
      ext = "gif";
    } else if (contentType.includes("webp") || url.match(/\.webp/i)) {
      ext = "webp";
    } else if (contentType.includes("svg") || url.match(/\.svg/i)) {
      ext = "svg";
    }

    const filename = `img_${index}.${ext}`;
    contentFolder.file(filename, buf);

    return { originalUrl: url, localPath: filename };
  } catch {
    return null;
  }
}

async function fetchAndBundleVideo(
  url: string,
  index: number,
  contentFolder: JSZip
): Promise<VideoMapping | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("video/mp4") && !url.toLowerCase().includes(".mp4")) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    const filename = `video_${index}.mp4`;
    contentFolder.file(filename, buf);
    return { originalUrl: url, localPath: filename };
  } catch {
    return null;
  }
}

async function fetchAndBundleFile(file: FileToBundle, contentFolder: JSZip): Promise<boolean> {
  try {
    const res = await fetch(file.url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    contentFolder.file(file.localPath, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

/** Safe, readable package filename: learners see it when the file saves. */
function sanitiseFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "download";
  return ext ? `${base}.${ext}` : base;
}

/**
 * Assigns each distinct file_download URL a unique path under files/.
 * Names are compared case-insensitively because some LMS hosts run on case-insensitive filesystems.
 */
function collectFiles(course: CourseForExport): FileToBundle[] {
  const byUrl = new Map<string, FileToBundle>();
  const usedNames = new Set<string>();

  for (const mod of course.modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      for (const page of lesson.pages ?? []) {
        for (const block of page.blocks ?? []) {
          if (block.category !== "content" || block.type !== "file_download") continue;
          const url = typeof block.data?.url === "string" ? block.data.url.trim() : "";
          if (!/^https?:\/\//i.test(url) || byUrl.has(url)) continue;

          const original =
            typeof block.data?.filename === "string" && block.data.filename
              ? block.data.filename
              : url.split("?")[0].split("/").pop() || "download";
          const safe = sanitiseFilename(original);
          const dot = safe.lastIndexOf(".");
          const stem = dot > 0 ? safe.slice(0, dot) : safe;
          const ext = dot > 0 ? safe.slice(dot) : "";
          let name = safe;
          for (let n = 2; usedNames.has(name.toLowerCase()); n++) name = `${stem}-${n}${ext}`;
          usedNames.add(name.toLowerCase());

          byUrl.set(url, { url, localPath: `files/${name}` });
        }
      }
    }
  }

  return Array.from(byUrl.values());
}

function collectImageUrls(course: CourseForExport): string[] {
  const urls = new Set<string>();

  for (const mod of course.modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      for (const page of lesson.pages ?? []) {
        for (const block of page.blocks ?? []) {
          if (block.category === "content" && block.type === "image") {
            const url = block.data?.url;
            if (typeof url === "string" && url.trim()) {
              urls.add(url.trim());
            }
          }
        }
      }
    }
  }

  return Array.from(urls);
}

function collectVideoUrls(course: CourseForExport): string[] {
  const urls = new Set<string>();

  for (const mod of course.modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      for (const page of lesson.pages ?? []) {
        for (const block of page.blocks ?? []) {
          if (block.category === "content" && block.type === "video_embed") {
            const url = block.data?.url;
            const mimeType = block.data?.mimeType;
            if (typeof url === "string" && url.trim()) {
              const trimmedUrl = url.trim();
              const isLikelyMp4 =
                /\.mp4($|\?)/i.test(trimmedUrl) ||
                mimeType === "video/mp4" ||
                !/^https?:\/\//i.test(trimmedUrl);
              if (isLikelyMp4) urls.add(trimmedUrl);
            }
          }
        }
      }
    }
  }

  return Array.from(urls);
}

function rewriteImageUrls(
  blocks: BlockForExport[],
  urlMap: Map<string, string>
): BlockForExport[] {
  return blocks.map((block) => {
    if (block.category === "content" && block.type === "image" && typeof block.data?.url === "string") {
      const localPath = urlMap.get(block.data.url);
      if (localPath) {
        return {
          ...block,
          data: { ...block.data, url: localPath },
        };
      }
    }
    return block;
  });
}

function rewriteVideoUrls(
  blocks: BlockForExport[],
  urlMap: Map<string, string>
): BlockForExport[] {
  return blocks.map((block) => {
    if (block.category === "content" && block.type === "video_embed" && typeof block.data?.url === "string") {
      const localPath = urlMap.get(block.data.url);
      if (localPath) {
        return {
          ...block,
          data: { ...block.data, url: localPath, mimeType: "video/mp4", sourceType: "upload" },
        };
      }
    }
    return block;
  });
}

function rewriteFileUrls(
  blocks: BlockForExport[],
  urlMap: Map<string, string>
): BlockForExport[] {
  return blocks.map((block) => {
    if (block.category === "content" && block.type === "file_download" && typeof block.data?.url === "string") {
      const localPath = urlMap.get(block.data.url.trim());
      if (localPath) {
        return {
          ...block,
          data: { ...block.data, url: localPath },
        };
      }
    }
    return block;
  });
}

function getGradingKey(block: BlockForExport): GradingKey | null {
  if (block.category !== "interaction") return null;
  
  if (block.type === "multiple_choice") {
    const correctIndex = Number((block.data as { correctIndex?: number }).correctIndex ?? 0);
    return { blockId: block.id, type: "multiple_choice", correctIndex };
  }
  if (block.type === "true_false") {
    const correct = (block.data as { correct?: boolean }).correct !== false;
    return { blockId: block.id, type: "true_false", correct };
  }
  if (block.type === "drag_and_drop") {
    const correctOrder = (block.data as { correctOrder?: number[] }).correctOrder ?? [];
    return { blockId: block.id, type: "drag_and_drop", correctOrder };
  }
  if (block.type === "matching") {
    const pairs = (block.data as { pairs?: { left: string; right: string }[] }).pairs ?? [];
    return { blockId: block.id, type: "matching", pairCount: pairs.length };
  }
  return null;
}

export interface BlockForExport {
  id: string;
  category: "content" | "interaction";
  type: string;
  data: Record<string, unknown>;
  order: number;
}

export interface CourseForExport {
  id: string;
  title: string;
  overview?: string | null;
  brandConfig?: BrandConfig | null;
  modules: {
    id: string;
    title: string;
    lessons: {
      id: string;
      title: string;
      pages: {
        id: string;
        title: string;
        blocks: BlockForExport[];
      }[];
    }[];
  }[];
}

export async function buildScorm12Zip(course: CourseForExport): Promise<Buffer> {
  const zip = new JSZip();
  const pages: { page: CourseForExport["modules"][0]["lessons"][0]["pages"][0]; index: number }[] = [];
  let index = 0;
  for (const mod of course.modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      for (const page of lesson.pages ?? []) {
        pages.push({ page, index: index++ });
      }
    }
  }

  const pageEntries: PageEntry[] = pages.map(({ page, index }) => ({
    id: page.id,
    identifier: String(index),
    title: page.title,
    href: `content/page_${index}.html`,
  }));

  zip.file("scorm-api.js", SCORM_API_JS);

  const contentFolder = zip.folder("content");
  if (!contentFolder) throw new Error("Failed to create content folder");

  const brandConfig = course.brandConfig ?? undefined;
  let logoPath: string | undefined;
  const logoUrl =
    brandConfig?.logoUrl && typeof brandConfig.logoUrl === "string" ? brandConfig.logoUrl : null;
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = logoUrl.includes(".png") ? "png" : logoUrl.includes(".svg") ? "svg" : "png";
        contentFolder.file(`logo.${ext}`, buf);
        logoPath = `logo.${ext}`;
      }
    } catch {
      // Skip logo if fetch fails
    }
  }

  const imageUrls = collectImageUrls(course);
  const imageUrlMap = new Map<string, string>();
  const exportWarnings: string[] = [];

  const imageResults = await Promise.all(
    imageUrls.map((url, idx) => fetchAndBundleImage(url, idx, contentFolder))
  );

  imageResults.forEach((result, idx) => {
    if (result) imageUrlMap.set(result.originalUrl, result.localPath);
    else exportWarnings.push(`Could not bundle image asset: ${imageUrls[idx]}`);
  });

  const videoUrls = collectVideoUrls(course);
  const videoUrlMap = new Map<string, string>();
  const videoResults = await Promise.all(
    videoUrls.map((url, idx) => fetchAndBundleVideo(url, idx, contentFolder))
  );
  videoResults.forEach((result, idx) => {
    if (result) videoUrlMap.set(result.originalUrl, result.localPath);
    else exportWarnings.push(`Could not bundle MP4 video asset: ${videoUrls[idx]}`);
  });

  const files = collectFiles(course);
  const fileUrlMap = new Map<string, string>();
  const fileResults = await Promise.all(files.map((file) => fetchAndBundleFile(file, contentFolder)));
  fileResults.forEach((ok, idx) => {
    if (ok) fileUrlMap.set(files[idx].url, files[idx].localPath);
    else exportWarnings.push(`Could not bundle download file: ${files[idx].url}`);
  });

  const additionalManifestFiles = new Set<string>(["scorm-api.js"]);
  for (const localImage of imageUrlMap.values()) additionalManifestFiles.add(`content/${localImage}`);
  for (const localVideo of videoUrlMap.values()) additionalManifestFiles.add(`content/${localVideo}`);
  for (const localFile of fileUrlMap.values()) additionalManifestFiles.add(`content/${localFile}`);
  if (logoPath) additionalManifestFiles.add(`content/${logoPath}`);

  const manifestXml = buildManifest12({
    courseId: course.id,
    courseTitle: course.title,
    pages: pageEntries,
    additionalFiles: Array.from(additionalManifestFiles),
  });
  zip.file("imsmanifest.xml", manifestXml);

  if (exportWarnings.length > 0) {
    console.warn(`SCORM export warnings for course ${course.id}:`, exportWarnings);
  }

  let totalScoreMax = 0;
  for (const { page } of pages) {
    for (const block of page.blocks ?? []) {
      if (
        block.category === "interaction" &&
        (block.type === "multiple_choice" ||
        block.type === "true_false" ||
        block.type === "drag_and_drop" ||
        block.type === "matching")
      ) {
        totalScoreMax += 1;
      }
    }
  }

  let pageIdx = 0;
  for (const mod of course.modules ?? []) {
    const moduleIndex = course.modules!.indexOf(mod);
    for (const lesson of mod.lessons ?? []) {
      const lessonIndex = mod.lessons!.indexOf(lesson);
      for (const page of lesson.pages ?? []) {
        const i = pageIdx++;
        const prevHref = i > 0 ? `page_${i - 1}.html` : undefined;
        const nextHref = i < pages.length - 1 ? `page_${i + 1}.html` : undefined;
        const gradingKeysByBlockId: Record<string, GradingKey> = {};
        for (const block of page.blocks ?? []) {
          const key = getGradingKey(block);
          if (key) gradingKeysByBlockId[block.id] = key;
        }
        const scormRuntime: ScormRuntimeOptions = {
          pageIndex: i,
          totalPages: pages.length,
          totalScoreMax: Math.max(1, totalScoreMax),
          gradingKeysByBlockId,
        };
        const rewrittenBlocks = rewriteFileUrls(
          rewriteVideoUrls(rewriteImageUrls(page.blocks, imageUrlMap), videoUrlMap),
          fileUrlMap
        );
        const html = renderPageHtml({
          pageTitle: page.title,
          blocks: rewrittenBlocks,
          courseTitle: course.title,
          prevHref,
          nextHref,
          scormApiPath: "../scorm-api.js",
          brandConfig: brandConfig ?? undefined,
          logoPath,
          scormRuntime,
          moduleIndex,
          moduleTitle: mod.title,
          lessonIndex,
          lessonTitle: lesson.title,
        });
        contentFolder.file(`page_${i}.html`, html);
      }
    }
  }

  const blob = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(blob);
}
