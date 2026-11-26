/**
 * Course snapshots: a saved copy of a course's outline and content.
 *
 * One is taken before any action that replaces or deletes content, so the
 * author can go back. Restoring rebuilds the modules from the copy.
 */
import type { Prisma } from "@prisma/client";
import { JsonNull, prisma } from "@/lib/db";

/** How many snapshots a course keeps. The oldest are dropped past this. */
export const MAX_SNAPSHOTS = 25;

export interface SnapshotBlock {
  category: string;
  type: string;
  data: unknown;
  order: number;
}
export interface SnapshotPage {
  title: string;
  order: number;
  completionRules: unknown;
  blocks: SnapshotBlock[];
}
export interface SnapshotLesson {
  title: string;
  order: number;
  pages: SnapshotPage[];
}
export interface SnapshotModule {
  title: string;
  order: number;
  lessons: SnapshotLesson[];
}
export interface SnapshotData {
  version: 1;
  overview: string | null;
  targetWordCount: number | null;
  ilos: unknown;
  assessmentPlan: unknown;
  modules: SnapshotModule[];
}

export interface SnapshotCounts {
  modules: number;
  lessons: number;
  pages: number;
  blocks: number;
}

export function countSnapshot(data: SnapshotData): SnapshotCounts {
  const lessons = data.modules.flatMap((m) => m.lessons);
  const pages = lessons.flatMap((l) => l.pages);
  return {
    modules: data.modules.length,
    lessons: lessons.length,
    pages: pages.length,
    blocks: pages.reduce((n, p) => n + p.blocks.length, 0),
  };
}

type Db = Prisma.TransactionClient | typeof prisma;

async function readCourse(db: Db, courseId: string): Promise<SnapshotData | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      overview: true,
      targetWordCount: true,
      ilos: true,
      assessmentPlan: true,
      modules: {
        orderBy: { order: "asc" },
        select: {
          title: true,
          order: true,
          lessons: {
            orderBy: { order: "asc" },
            select: {
              title: true,
              order: true,
              pages: {
                orderBy: { order: "asc" },
                select: {
                  title: true,
                  order: true,
                  completionRules: true,
                  blocks: {
                    orderBy: { order: "asc" },
                    select: { category: true, type: true, data: true, order: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!course) return null;
  return { version: 1, ...course };
}

/**
 * Saves a snapshot of the course as it stands. Returns its id, or null if it
 * could not be saved.
 *
 * It never throws: a failed snapshot must not block the action it precedes.
 * The one case where that matters is a database that has not had the
 * CourseSnapshot migration applied yet.
 */
export async function takeSnapshot(courseId: string, reason: string): Promise<string | null> {
  try {
    const data = await readCourse(prisma, courseId);
    if (!data) return null;
    // Nothing worth keeping in a course with no modules.
    if (data.modules.length === 0) return null;
    const snapshot = await prisma.courseSnapshot.create({
      data: { courseId, reason: reason.slice(0, 200), data: data as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
    const stale = await prisma.courseSnapshot.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
      skip: MAX_SNAPSHOTS,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.courseSnapshot.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
    return snapshot.id;
  } catch (e) {
    console.error("Could not save a course snapshot:", e);
    return null;
  }
}

function json(value: unknown) {
  return value === null || value === undefined ? JsonNull : (value as Prisma.InputJsonValue);
}

/**
 * Puts a course back to a snapshot. The current state is snapshotted first,
 * so a restore can itself be undone. Returns false if the snapshot is not
 * this course's.
 */
export async function restoreSnapshot(courseId: string, snapshotId: string): Promise<boolean> {
  const snapshot = await prisma.courseSnapshot.findFirst({
    where: { id: snapshotId, courseId },
  });
  if (!snapshot) return false;
  const data = snapshot.data as unknown as SnapshotData;
  if (!data || !Array.isArray(data.modules)) return false;

  const when = snapshot.createdAt.toISOString().slice(0, 16).replace("T", " ");
  await takeSnapshot(courseId, `Before restoring the version from ${when}`);

  await prisma.$transaction(
    async (tx) => {
      await tx.course.update({
        where: { id: courseId },
        data: {
          overview: data.overview ?? null,
          targetWordCount: data.targetWordCount ?? null,
          ilos: json(data.ilos),
          assessmentPlan: json(data.assessmentPlan),
        },
      });
      await tx.module.deleteMany({ where: { courseId } });
      for (const mod of data.modules) {
        const m = await tx.module.create({
          data: { courseId, title: mod.title, order: mod.order },
        });
        for (const lesson of mod.lessons) {
          const l = await tx.lesson.create({
            data: { moduleId: m.id, title: lesson.title, order: lesson.order },
          });
          for (const page of lesson.pages) {
            const p = await tx.page.create({
              data: {
                lessonId: l.id,
                title: page.title,
                order: page.order,
                completionRules:
                  page.completionRules === null || page.completionRules === undefined
                    ? undefined
                    : (page.completionRules as Prisma.InputJsonValue),
              },
            });
            if (page.blocks.length > 0) {
              await tx.block.createMany({
                data: page.blocks.map((b) => ({
                  pageId: p.id,
                  category: b.category,
                  type: b.type,
                  data: (b.data ?? {}) as Prisma.InputJsonValue,
                  order: b.order,
                })),
              });
            }
          }
        }
      }
    },
    { timeout: 60000 }
  );
  return true;
}
