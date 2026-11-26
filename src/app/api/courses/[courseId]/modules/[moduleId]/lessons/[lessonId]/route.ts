import { takeSnapshot } from "@/lib/snapshots";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string; lessonId: string }> }
) {
  const { lessonId } = await params;
  try {
    const body = await request.json();
    const { title, order } = body as { title?: string; order?: number };
    const data: { title?: string; order?: number } = {};
    if (title !== undefined) data.title = typeof title === "string" ? title.trim() : undefined;
    if (typeof order === "number") data.order = order;

    const lesson = await prisma.lesson.update({
      where: { id: lessonId },
      data,
    });
    return NextResponse.json(lesson);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update lesson" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string; lessonId: string }> }
) {
  const { courseId, lessonId } = await params;
  try {
    const doomed = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { title: true } });
    if (doomed) await takeSnapshot(courseId, `Before deleting the lesson "${doomed.title}"`);
    await prisma.lesson.delete({ where: { id: lessonId } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to delete lesson" }, { status: 500 });
  }
}
