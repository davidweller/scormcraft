import { takeSnapshot } from "@/lib/snapshots";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string }> }
) {
  const { moduleId } = await params;
  try {
    const body = await request.json();
    const { title, order } = body as { title?: string; order?: number };
    const data: { title?: string; order?: number } = {};
    if (title !== undefined) data.title = typeof title === "string" ? title.trim() : undefined;
    if (typeof order === "number") data.order = order;

    const module_ = await prisma.module.update({
      where: { id: moduleId },
      data,
    });
    return NextResponse.json(module_);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update module" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string }> }
) {
  const { courseId, moduleId } = await params;
  try {
    const doomed = await prisma.module.findUnique({ where: { id: moduleId }, select: { title: true } });
    if (doomed) await takeSnapshot(courseId, `Before deleting the module "${doomed.title}"`);
    await prisma.module.delete({ where: { id: moduleId } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to delete module" }, { status: 500 });
  }
}
