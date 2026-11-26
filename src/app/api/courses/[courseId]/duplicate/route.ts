import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient;

async function copyPage(tx: Tx, pageId: string, lessonId: string, order: number, title?: string) {
  const page = await tx.page.findUnique({
    where: { id: pageId },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
  if (!page) return null;
  const created = await tx.page.create({
    data: {
      lessonId,
      title: title ?? page.title,
      order,
      completionRules: page.completionRules ?? undefined,
    },
  });
  if (page.blocks.length > 0) {
    await tx.block.createMany({
      data: page.blocks.map((b) => ({
        pageId: created.id,
        category: b.category,
        type: b.type,
        data: b.data as Prisma.InputJsonValue,
        order: b.order,
      })),
    });
  }
  return created;
}

/**
 * Duplicates a lesson or a page, placing the copy straight after the original.
 * Modules have their own route at modules/{id}/duplicate.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const { kind, id } = (await request.json().catch(() => ({}))) as {
      kind?: "lesson" | "page";
      id?: string;
    };
    if ((kind !== "lesson" && kind !== "page") || typeof id !== "string") {
      return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (kind === "page") {
        const page = await tx.page.findFirst({
          where: { id, lesson: { module: { courseId } } },
          select: { id: true, lessonId: true, order: true, title: true },
        });
        if (!page) return null;
        // Make room after the original.
        await tx.page.updateMany({
          where: { lessonId: page.lessonId, order: { gt: page.order } },
          data: { order: { increment: 1 } },
        });
        const copy = await copyPage(tx, page.id, page.lessonId, page.order + 1, `${page.title} (copy)`);
        return copy ? { id: copy.id, pageId: copy.id } : null;
      }

      const lesson = await tx.lesson.findFirst({
        where: { id, module: { courseId } },
        include: { pages: { orderBy: { order: "asc" }, select: { id: true, order: true } } },
      });
      if (!lesson) return null;
      await tx.lesson.updateMany({
        where: { moduleId: lesson.moduleId, order: { gt: lesson.order } },
        data: { order: { increment: 1 } },
      });
      const copy = await tx.lesson.create({
        data: { moduleId: lesson.moduleId, title: `${lesson.title} (copy)`, order: lesson.order + 1 },
      });
      let firstPageId: string | null = null;
      for (const page of lesson.pages) {
        const created = await copyPage(tx, page.id, copy.id, page.order);
        if (created && !firstPageId) firstPageId = created.id;
      }
      return { id: copy.id, pageId: firstPageId };
    });

    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to duplicate" }, { status: 500 });
  }
}
