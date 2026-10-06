import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  CONTENT_BLOCK_TYPES,
  INTERACTION_BLOCK_TYPES,
  isSystemBlockType,
} from "@/types/course";
import type { BlockCategory, ContentBlockType, InteractionBlockType } from "@/types/course";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string; moduleId: string; lessonId: string; pageId: string }> }
) {
  const { pageId } = await params;
  try {
    const body = await request.json();
    const { category, type, data, order } = body as {
      category?: BlockCategory;
      type?: string;
      data?: unknown;
      order?: number;
    };

    if (!category || (category !== "content" && category !== "interaction")) {
      return NextResponse.json({ error: "category must be 'content' or 'interaction'" }, { status: 400 });
    }

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    if (category === "content" && !CONTENT_BLOCK_TYPES.includes(type as ContentBlockType)) {
      return NextResponse.json({ error: `Invalid content block type: ${type}` }, { status: 400 });
    }

    if (category === "interaction" && !INTERACTION_BLOCK_TYPES.includes(type as InteractionBlockType)) {
      return NextResponse.json({ error: `Invalid interaction block type: ${type}` }, { status: 400 });
    }

    // Known type, but only the import pipeline (which writes via createMany)
    // may produce it.
    if (isSystemBlockType(type)) {
      return NextResponse.json(
        { error: `Block type '${type}' cannot be created directly.` },
        { status: 400 }
      );
    }

    const count = await prisma.block.count({ where: { pageId } });
    const block = await prisma.block.create({
      data: {
        pageId,
        category,
        type,
        data: data ?? {},
        order: typeof order === "number" ? order : count,
      },
    });
    return NextResponse.json(block);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2003") {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to create block" }, { status: 500 });
  }
}
