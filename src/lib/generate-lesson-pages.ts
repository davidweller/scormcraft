import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateLessonContent } from "@/lib/ai";
import { courseAiSettings, getLlm, type LlmProvider } from "@/lib/llm";

export async function generatePagesForLesson(courseId: string, lessonId: string): Promise<{ success: true; pageId: string } | { success: false; error: string }> {
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

  await prisma.$transaction(async (tx) => {
    await tx.block.deleteMany({ where: { pageId: page!.id, category: "content" } });

    for (let i = 0; i < generated.contentBlocks.length; i++) {
      const b = generated.contentBlocks[i];
      if (b.type !== "text" && b.type !== "heading") continue;
      await tx.block.create({
        data: { 
          pageId: page!.id, 
          category: "content",
          type: b.type, 
          data: b.content ?? {}, 
          order: i 
        },
      });
    }
  });

  return { success: true, pageId: page.id };
}
