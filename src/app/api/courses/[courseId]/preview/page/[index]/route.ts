import { NextResponse } from "next/server";
import { getCourseForExport } from "@/lib/course-export";
import { getBaseUrl } from "@/lib/base-url";
import {
  renderPageHtml,
  type ScormRuntimeOptions,
  type GradingKey,
} from "@/lib/scorm/render-page-html";
import type { CourseForExport } from "@/lib/scorm/build-package";

function getGradingKey(block: {
  id: string;
  type: string;
  data: Record<string, unknown>;
}): GradingKey | null {
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

function flattenPages(course: CourseForExport): { page: CourseForExport["modules"][0]["lessons"][0]["pages"][0]; index: number; moduleIndex: number; moduleTitle: string; lessonIndex: number; lessonTitle: string }[] {
  const out: { page: CourseForExport["modules"][0]["lessons"][0]["pages"][0]; index: number; moduleIndex: number; moduleTitle: string; lessonIndex: number; lessonTitle: string }[] = [];
  let index = 0;
  for (const mod of course.modules ?? []) {
    const moduleIndex = course.modules!.indexOf(mod);
    for (const lesson of mod.lessons ?? []) {
      const lessonIndex = mod.lessons!.indexOf(lesson);
      for (const page of lesson.pages ?? []) {
        out.push({
          page,
          index: index++,
          moduleIndex,
          moduleTitle: mod.title,
          lessonIndex,
          lessonTitle: lesson.title,
        });
      }
    }
  }
  return out;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; index: string }> }
) {
  const { courseId, index: indexParam } = await params;
  const index = parseInt(indexParam, 10);
  if (Number.isNaN(index) || index < 0) {
    return new NextResponse("Invalid page index", { status: 400 });
  }

  const course = await getCourseForExport(courseId);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const flat = flattenPages(course);
  if (index >= flat.length) {
    return new NextResponse("Page not found", { status: 404 });
  }

  const { page, moduleIndex, moduleTitle, lessonIndex, lessonTitle } = flat[index];
  const baseUrl = getBaseUrl();
  const prevHref = index > 0 ? `${baseUrl}/api/courses/${courseId}/preview/page/${index - 1}` : undefined;
  const nextHref = index < flat.length - 1 ? `${baseUrl}/api/courses/${courseId}/preview/page/${index + 1}` : undefined;
  const scormApiPath = `${baseUrl}/api/courses/${courseId}/preview/scorm-api`;

  const brandConfig = course.brandConfig ?? undefined;
  const logoPath =
    brandConfig && typeof brandConfig === "object" && typeof (brandConfig as { logoUrl?: string }).logoUrl === "string"
      ? (brandConfig as { logoUrl: string }).logoUrl
      : undefined;

  let totalScoreMax = 0;
  for (const { page: p } of flat) {
    for (const block of p.blocks ?? []) {
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

  const gradingKeysByBlockId: Record<string, GradingKey> = {};
  for (const block of page.blocks ?? []) {
    if (block.category === "interaction") {
      const key = getGradingKey({ id: block.id, type: block.type, data: block.data ?? {} });
      if (key) gradingKeysByBlockId[block.id] = key;
    }
  }

  const scormRuntime: ScormRuntimeOptions = {
    pageIndex: index,
    totalPages: flat.length,
    totalScoreMax: Math.max(1, totalScoreMax),
    gradingKeysByBlockId,
  };

  // Blob links are cross-origin, so the browser would ignore the download filename; route them through our own origin
  const blocks = (page.blocks ?? []).map((block) =>
    block.type === "file_download" && typeof block.data?.url === "string" && block.data.url
      ? {
          ...block,
          data: {
            ...block.data,
            url: `${baseUrl}/api/media/download?url=${encodeURIComponent(block.data.url)}`,
          },
        }
      : block
  );

  const html = renderPageHtml({
    pageTitle: page.title,
    blocks,
    courseTitle: course.title,
    prevHref,
    nextHref,
    scormApiPath,
    brandConfig,
    logoPath,
    scormRuntime,
    moduleIndex,
    moduleTitle,
    lessonIndex,
    lessonTitle,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
