import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generatePagesForLesson, lessonHasContent } from "@/lib/generate-lesson-pages";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const { lessonIds, overwrite } = body as { lessonIds?: string[]; overwrite?: boolean };

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } },
      },
    });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const allLessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
    // With no list given, only lessons with no content are generated.
    // Replacing existing content needs both a list and overwrite: true.
    const named = Array.isArray(lessonIds) && lessonIds.length > 0;
    const candidates = named ? lessonIds.filter((id) => allLessonIds.includes(id)) : allLessonIds;
    const replace = named && overwrite === true;
    const targetIds: string[] = [];
    for (const id of candidates) {
      if (replace || !(await lessonHasContent(id))) targetIds.push(id);
    }

    const results: { lessonId: string; success: boolean; error?: string }[] = [];
    for (const lessonId of targetIds) {
      const result = await generatePagesForLesson(courseId, lessonId, { overwrite: replace });
      results.push({
        lessonId,
        success: result.success,
        ...(result.success ? {} : { error: result.error }),
      });
    }

    return NextResponse.json({ results });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Generate pages failed" }, { status: 500 });
  }
}
