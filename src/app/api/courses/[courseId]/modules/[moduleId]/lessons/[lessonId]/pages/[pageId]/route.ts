import { takeSnapshot } from "@/lib/snapshots";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string; lessonId: string; pageId: string }> }
) {
  const { pageId } = await params;
  try {
    const body = await request.json();
    const { title, order, completionRules } = body as {
      title?: string;
      order?: number;
      completionRules?: unknown;
    };
    const data: Prisma.PageUpdateInput = {};
    if (title !== undefined) data.title = typeof title === "string" ? title.trim() : undefined;
    if (typeof order === "number") data.order = order;
    if (completionRules !== undefined) data.completionRules = completionRules as Prisma.InputJsonValue;

    const page = await prisma.page.update({
      where: { id: pageId },
      data,
    });
    return NextResponse.json(page);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update page" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string; lessonId: string; pageId: string }> }
) {
  const { courseId, pageId } = await params;
  try {
    const doomed = await prisma.page.findUnique({ where: { id: pageId }, select: { title: true } });
    if (doomed) await takeSnapshot(courseId, `Before deleting the page "${doomed.title}"`);
    await prisma.page.delete({ where: { id: pageId } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to delete page" }, { status: 500 });
  }
}
