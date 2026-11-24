import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { courseAiSettings, getLlm, type LlmProvider } from "@/lib/llm";
import {
  generateBlueprintSection,
  type BlueprintSection,
  type BlueprintData,
} from "@/lib/ai";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const { section, currentBlueprint } = body as {
      section: BlueprintSection;
      currentBlueprint?: BlueprintData;
    };
    if (!section || typeof section !== "string") {
      return NextResponse.json({ error: "section is required" }, { status: 400 });
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

    const context = {
      title: course.title,
      overview: course.overview,
      audience: course.audience,
      targetWordCount: course.targetWordCount,
      tone: course.tone,
      complianceLevel: course.complianceLevel,
    };

    const result = await generateBlueprintSection(
      llm,
      context,
      section,
      currentBlueprint
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Blueprint generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
