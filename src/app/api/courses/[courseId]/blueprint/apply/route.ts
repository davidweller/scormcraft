import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { JsonNull, prisma } from "@/lib/db";
import { planBlueprintApply, type BlueprintModuleInput } from "@/lib/blueprint-apply";

type BlueprintModule = BlueprintModuleInput;

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
        // Update in place. Deleting and recreating would cascade to every
        // page and block, which destroys imported and written content.
        const existing = await tx.module.findMany({
          where: { courseId },
          select: { id: true, lessons: { select: { id: true } } },
        });
        const plan = planBlueprintApply(existing, modulesInput);

        for (const mod of plan.modules) {
          const moduleId = mod.id
            ? (
                await tx.module.update({
                  where: { id: mod.id },
                  data: { title: mod.title, order: mod.order },
                })
              ).id
            : (await tx.module.create({ data: { courseId, title: mod.title, order: mod.order } })).id;

          for (const les of mod.lessons) {
            if (les.id) {
              await tx.lesson.update({
                where: { id: les.id },
                data: { moduleId, title: les.title, order: les.order },
              });
            } else {
              await tx.lesson.create({ data: { moduleId, title: les.title, order: les.order } });
            }
          }
        }

        // Kept lessons have already been moved to their module, so deleting
        // the removed modules cannot take a kept lesson with it.
        if (plan.deleteLessonIds.length > 0) {
          await tx.lesson.deleteMany({ where: { id: { in: plan.deleteLessonIds } } });
        }
        if (plan.deleteModuleIds.length > 0) {
          await tx.module.deleteMany({ where: { id: { in: plan.deleteModuleIds } } });
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
