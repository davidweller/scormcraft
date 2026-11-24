import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { JsonNull, prisma } from "@/lib/db";

interface BlueprintModule {
  title: string;
  lessons: { title: string }[];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const body = await request.json();
    const {
      description,
      targetWordCount,
      modules: modulesInput,
      ilos,
      assessmentPlan,
    } = body as {
      description?: string;
      targetWordCount?: number;
      modules?: BlueprintModule[];
      ilos?: string[];
      assessmentPlan?: string;
    };

    await prisma.$transaction(async (tx) => {
      await tx.course.update({
        where: { id: courseId },
        data: {
          ...(description !== undefined && { overview: description.trim() || null }),
          ...(targetWordCount !== undefined && { targetWordCount: typeof targetWordCount === "number" ? targetWordCount : null }),
          ...(ilos !== undefined && { ilos: Array.isArray(ilos) ? (ilos as Prisma.InputJsonValue) : JsonNull }),
          ...(assessmentPlan !== undefined && {
            assessmentPlan:
              typeof assessmentPlan === "string" && assessmentPlan.trim()
                ? assessmentPlan.trim()
                : JsonNull,
          }),
        },
      });

      if (Array.isArray(modulesInput) && modulesInput.length > 0) {
        await tx.module.deleteMany({ where: { courseId } });
        for (let i = 0; i < modulesInput.length; i++) {
          const mod = modulesInput[i];
          const moduleRecord = await tx.module.create({
            data: { courseId, title: mod.title?.trim() || `Module ${i + 1}`, order: i },
          });
          const lessons = mod.lessons ?? [];
          for (let j = 0; j < lessons.length; j++) {
            await tx.lesson.create({
              data: {
                moduleId: moduleRecord.id,
                title: lessons[j]?.title?.trim() || `Lesson ${j + 1}`,
                order: j,
              },
            });
          }
        }
      }
    });

    const updated = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } },
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to apply blueprint" }, { status: 500 });
  }
}
