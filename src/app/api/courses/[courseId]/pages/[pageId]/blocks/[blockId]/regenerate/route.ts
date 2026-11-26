import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { regenerateContentBlock, regenerateInteractionBlock } from "@/lib/ai";
import { courseAiSettings, getLlm, type LlmProvider } from "@/lib/llm";

const REGENERABLE_CONTENT_TYPES = ["text", "heading", "key_insight", "key_point"];
const REGENERABLE_INTERACTION_TYPES = ["multiple_choice", "true_false", "reflection", "drag_and_drop", "matching", "dialog_cards"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string; pageId: string; blockId: string }> }
) {
  const { courseId, pageId, blockId } = await params;
  // With preview, the new version is returned but not saved, so the author
  // can compare it with what they have before anything is replaced.
  const { preview } = (await request.json().catch(() => ({}))) as { preview?: boolean };

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        title: true,
        tone: true,
        settings: true,
      },
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const block = await prisma.block.findUnique({
      where: { id: blockId },
      include: {
        page: {
          include: {
            lesson: true,
            blocks: {
              orderBy: { order: "asc" },
              select: { category: true, type: true, data: true },
            },
          },
        },
      },
    });

    if (!block || block.page.id !== pageId) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    const isContent = block.category === "content";
    const isInteraction = block.category === "interaction";

    if (isContent && !REGENERABLE_CONTENT_TYPES.includes(block.type)) {
      return NextResponse.json(
        { error: `Cannot regenerate content block type: ${block.type}` },
        { status: 400 }
      );
    }

    if (isInteraction && !REGENERABLE_INTERACTION_TYPES.includes(block.type)) {
      return NextResponse.json(
        { error: `Cannot regenerate interaction type: ${block.type}` },
        { status: 400 }
      );
    }

    let llm: LlmProvider;
    try {
      llm = await getLlm(courseAiSettings(course.settings));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "No AI provider is set up." },
        { status: 400 }
      );
    }

    const pageContent = block.page.blocks
      .filter(b => b.category === "content")
      .map((b) => {
        const data = b.data as Record<string, unknown>;
        if (b.type === "text" && typeof data.text === "string") return data.text;
        if (b.type === "heading" && typeof data.text === "string") return `## ${data.text}`;
        if (b.type === "key_insight" && typeof data.text === "string") return data.text;
        if (b.type === "key_point" && typeof data.text === "string") return data.text;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");

    let updatedData: Prisma.InputJsonValue;

    if (isContent) {
      const result = await regenerateContentBlock(llm, {
        blockType: block.type,
        currentContent: block.data as Record<string, unknown>,
        pageContent,
        lessonTitle: block.page.lesson.title,
        courseTitle: course.title,
        tone: course.tone,
      });
      updatedData = result.content as Prisma.InputJsonValue;
    } else {
      const result = await regenerateInteractionBlock(llm, {
        blockType: block.type,
        currentConfig: block.data as Record<string, unknown>,
        pageContent,
        lessonTitle: block.page.lesson.title,
        courseTitle: course.title,
        tone: course.tone,
        includeExplanation: true,
      });
      updatedData = result.config as Prisma.InputJsonValue;
    }

    if (preview === true) {
      const { page: _page, ...current } = block;
      void _page;
      return NextResponse.json({ success: true, block: { ...current, data: updatedData } });
    }

    const updated = await prisma.block.update({
      where: { id: blockId },
      data: { data: updatedData },
    });

    return NextResponse.json({ success: true, block: updated });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Regeneration failed" },
      { status: 500 }
    );
  }
}
