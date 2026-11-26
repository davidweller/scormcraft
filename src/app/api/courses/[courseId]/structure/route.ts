import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { outlineMatches, type OutlinePayload } from "@/lib/outline";

/**
 * Saves a rearranged outline: the order of modules, lessons and pages, and
 * which module each lesson and which lesson each page belongs to.
 *
 * The body must name every module, lesson and page of the course exactly
 * once. Nothing is created or deleted here.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const body = (await request.json().catch(() => null)) as OutlinePayload | null;
    if (!body || !Array.isArray(body.modules)) {
      return NextResponse.json({ error: "modules is required" }, { status: 400 });
    }

    const modules = await prisma.module.findMany({
      where: { courseId },
      select: {
        id: true,
        lessons: { select: { id: true, pages: { select: { id: true } } } },
      },
    });
    const existing: OutlinePayload = {
      modules: modules.map((m) => ({
        id: m.id,
        lessons: m.lessons.map((l) => ({ id: l.id, pages: l.pages.map((p) => p.id) })),
      })),
    };
    if (!outlineMatches(existing, body)) {
      return NextResponse.json(
        { error: "The outline has changed since it was loaded. Reload and try again." },
        { status: 409 }
      );
    }

    await prisma.$transaction(async (tx) => {
      for (let mi = 0; mi < body.modules.length; mi++) {
        const mod = body.modules[mi];
        await tx.module.update({ where: { id: mod.id }, data: { order: mi } });
        for (let li = 0; li < mod.lessons.length; li++) {
          const lesson = mod.lessons[li];
          await tx.lesson.update({
            where: { id: lesson.id },
            data: { moduleId: mod.id, order: li },
          });
          for (let pi = 0; pi < lesson.pages.length; pi++) {
            await tx.page.update({
              where: { id: lesson.pages[pi] },
              data: { lessonId: lesson.id, order: pi },
            });
          }
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save the outline" }, { status: 500 });
  }
}
