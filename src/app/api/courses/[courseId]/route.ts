import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mergeCourseSettings } from "@/lib/course-settings";
import type { Prisma } from "@prisma/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              orderBy: { order: "asc" },
              include: {
                pages: {
                  orderBy: { order: "asc" },
                  include: {
                    blocks: { orderBy: { order: "asc" } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    return NextResponse.json(course);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load course" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const body = await request.json();
    const {
      title,
      overview,
      audience,
      targetWordCount,
      tone,
      complianceLevel,
      brandConfig,
      settings,
      ilos,
      assessmentPlan,
      interactionsReviewedAt,
    } = body as {
      title?: string;
      overview?: string;
      audience?: string;
      targetWordCount?: number | null;
      tone?: string;
      complianceLevel?: string;
      brandConfig?: unknown;
      settings?: unknown;
      ilos?: unknown;
      assessmentPlan?: unknown;
      interactionsReviewedAt?: string;
    };
    const data: Prisma.CourseUpdateInput = {};
    if (title !== undefined) data.title = typeof title === "string" ? title.trim() : undefined;
    if (overview !== undefined) data.overview = typeof overview === "string" ? overview.trim() : null;
    if (audience !== undefined) data.audience = typeof audience === "string" ? audience.trim() || null : undefined;
    if (targetWordCount !== undefined) data.targetWordCount = typeof targetWordCount === "number" ? targetWordCount : null;
    if (tone !== undefined) data.tone = typeof tone === "string" ? tone.trim() || null : undefined;
    if (complianceLevel !== undefined) data.complianceLevel = typeof complianceLevel === "string" ? complianceLevel.trim() || null : undefined;
    if (brandConfig !== undefined) data.brandConfig = brandConfig as Prisma.InputJsonValue;
    if (settings !== undefined) {
      // Merge, don't replace: the settings page sends only the keys it changed.
      const current = await prisma.course.findUnique({ where: { id: courseId }, select: { settings: true } });
      data.settings = mergeCourseSettings(current?.settings, settings) as Prisma.InputJsonValue;
    }
    if (ilos !== undefined) data.ilos = ilos as Prisma.InputJsonValue;
    if (assessmentPlan !== undefined) data.assessmentPlan = assessmentPlan as Prisma.InputJsonValue;
    if (interactionsReviewedAt !== undefined) data.interactionsReviewedAt = new Date(interactionsReviewedAt);

    const course = await prisma.course.update({
      where: { id: courseId },
      data,
    });
    return NextResponse.json(course);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to update course" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    await prisma.course.delete({ where: { id: courseId } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to delete course" }, { status: 500 });
  }
}
