import { takeSnapshot } from "@/lib/snapshots";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateLessonContent } from "@/lib/ai";
import { courseAiSettings, getLlm, type LlmProvider } from "@/lib/llm";

/** Returned when a lesson already has content and the caller did not ask to replace it. */
export const LESSON_HAS_CONTENT = "This lesson already has content.";

/** Block types that lesson generation writes, and so the only ones it may replace. */
const GENERATED_TYPES = ["text", "heading"];

export async function lessonHasContent(lessonId: string): Promise<boolean> {
  const count = await prisma.block.count({
    where: { category: "content", page: { lessonId } },
  });
  return count > 0;
}

export async function generatePagesForLesson(
  courseId: string,
  lessonId: string,
  options: { overwrite?: boolean } = {}
): Promise<{ success: true; pageId: string } | { success: false; error: string }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      overview: true,
      audience: true,
      tone: true,
      ilos: true,
      assessmentPlan: true,
      settings: true,
      targetWordCount: true,
    },
  });
  if (!course) return { success: false, error: "Course not found" };

  let targetWordCountPerLesson: number | undefined;
  if (course.targetWordCount) {
    const totalLessons = await prisma.lesson.count({
      where: { module: { courseId } },
    });
    if (totalLessons > 0) {
      targetWordCountPerLesson = Math.round(course.targetWordCount / totalLessons);
    }
  }

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, module: { courseId } },
    select: { id: true, title: true },
  });
  if (!lesson) return { success: false, error: "Lesson not found" };

  // Checked before the AI call, so a refused request costs nothing.
  if (!options.overwrite && (await lessonHasContent(lessonId))) {
    return { success: false, error: LESSON_HAS_CONTENT };
  }

  let llm: LlmProvider;
  try {
    llm = await getLlm(courseAiSettings(course.settings));
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "No AI provider is set up." };
  }

  const ilos = Array.isArray(course.ilos)
    ? (course.ilos as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;
  const context = {
    courseTitle: course.title,
    overview: course.overview,
    audience: course.audience,
    tone: course.tone,
    ilos,
    assessmentPlan:
      typeof course.assessmentPlan === "string" ? course.assessmentPlan : undefined,
    targetWordCountPerLesson,
  };
  let generated: Awaited<ReturnType<typeof generateLessonContent>>;
  try {
    generated = await generateLessonContent(llm, lesson.title, context);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "AI generation failed" };
  }

  let page = await prisma.page.findFirst({
    where: { lessonId },
    orderBy: { order: "asc" },
  });
  if (!page) {
    page = await prisma.page.create({
      data: { lessonId, title: lesson.title, order: 0 },
    });
  }

  // Taken after the AI call succeeds, so a failed generation leaves no entry.
  if (options.overwrite && (await lessonHasContent(lessonId))) {
    await takeSnapshot(courseId, `Before regenerating the lesson "${lesson.title}"`);
  }

  const newBlocks = generated.contentBlocks.filter(
    (b) => b.type === "text" || b.type === "heading"
  );

  await prisma.$transaction(async (tx) => {
    // Replace only the text and headings. Images, tables, file downloads,
    // preserved pages and interactions on the page are kept.
    await tx.block.deleteMany({
      where: { pageId: page!.id, category: "content", type: { in: GENERATED_TYPES } },
    });

    for (let i = 0; i < newBlocks.length; i++) {
      const b = newBlocks[i];
      await tx.block.create({
        data: {
          pageId: page!.id,
          category: "content",
          type: b.type,
          data: b.content ?? {},
          order: i,
        },
      });
    }

    // Kept blocks follow the new text, in the order they were already in.
    const kept = await tx.block.findMany({
      where: {
        pageId: page!.id,
        NOT: { category: "content", type: { in: GENERATED_TYPES } },
      },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < kept.length; i++) {
      await tx.block.update({
        where: { id: kept[i].id },
        data: { order: newBlocks.length + i },
      });
    }
  });

  return { success: true, pageId: page.id };
}
