import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generatePagesForLesson, LESSON_HAS_CONTENT } from "@/lib/generate-lesson-pages";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string; lessonId: string }> }
) {
  const { courseId, lessonId } = await params;
  try {
    // A lesson that already has content is only regenerated on request.
    const body = (await request.json().catch(() => ({}))) as { overwrite?: boolean };
    const result = await generatePagesForLesson(courseId, lessonId, {
      overwrite: body.overwrite === true,
    });
    if (!result.success) {
      const status =
        result.error === "Course not found" || result.error === "Lesson not found"
          ? 404
          : result.error === LESSON_HAS_CONTENT
            ? 409
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    const page = await prisma.page.findUnique({
      where: { id: result.pageId },
      include: {
        blocks: { orderBy: { order: "asc" } },
      },
    });
    return NextResponse.json(page);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
