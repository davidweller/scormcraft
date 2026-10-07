/**
 * Write an analysed SCORM import into the database.
 *
 * Unlike the DOCX import path, which creates the course and then deletes it
 * from a catch block, this runs inside a transaction. The compensating version
 * leaves a half-built course behind if the process dies between the error and
 * the delete.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ImportedCourseDraft } from "./types";

/** Interactive transactions default to 5s, which a 300-page import will exceed. */
const TRANSACTION_TIMEOUT_MS = 120_000;

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (Array.isArray(value) && value.length === 0) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export interface PersistOptions {
  /** Overrides the title from the package, when the user edited it. */
  title?: string;
}

export interface PersistedCourse {
  id: string;
  title: string;
}

export async function persistScormImport(
  draft: ImportedCourseDraft,
  options: PersistOptions = {}
): Promise<PersistedCourse> {
  const title = options.title?.trim() || draft.title || "Imported course";

  return prisma.$transaction(
    async (tx) => {
      const course = await tx.course.create({
        data: {
          title,
          overview: draft.overview,
          audience: draft.audience,
          tone: draft.tone,
          complianceLevel: draft.complianceLevel,
          targetWordCount: draft.targetWordCount,
          brandConfig: jsonOrNull(draft.brandConfig),
          ilos: jsonOrNull(draft.ilos),
          assessmentPlan: jsonOrNull(draft.assessmentPlan),
          interactionConfig: jsonOrNull(draft.interactionConfig),
          // NOTE: draft.scormMetadata is not written yet — Course has no
          // scormMetadata column until the Phase 5 migration adds one. It is
          // always null today, so nothing is being dropped.
        },
      });

      for (const [moduleIdx, moduleDraft] of draft.modules.entries()) {
        const moduleRecord = await tx.module.create({
          data: { courseId: course.id, title: moduleDraft.title, order: moduleIdx },
        });

        for (const [lessonIdx, lessonDraft] of moduleDraft.lessons.entries()) {
          const lessonRecord = await tx.lesson.create({
            data: { moduleId: moduleRecord.id, title: lessonDraft.title, order: lessonIdx },
          });

          for (const [pageIdx, pageDraft] of lessonDraft.pages.entries()) {
            const pageRecord = await tx.page.create({
              data: {
                lessonId: lessonRecord.id,
                title: pageDraft.title,
                order: pageIdx,
                completionRules: jsonOrNull(pageDraft.completionRules),
              },
            });

            if (pageDraft.blocks.length === 0) continue;
            await tx.block.createMany({
              data: pageDraft.blocks.map((blockDraft, blockIdx) => ({
                pageId: pageRecord.id,
                category: blockDraft.category,
                type: blockDraft.type,
                // `needsReview` is a flag the heuristics set for the author, so
                // it belongs in the block's data, not alongside it.
                data: (blockDraft.needsReview
                  ? { ...blockDraft.data, needsReview: true }
                  : blockDraft.data) as Prisma.InputJsonValue,
                order: blockIdx,
              })),
            });
          }
        }
      }

      return { id: course.id, title: course.title };
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );
}
