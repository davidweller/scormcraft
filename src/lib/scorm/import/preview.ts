/**
 * Turn an analysed import into the payload the review step renders.
 *
 * The loss report travels with it, grouped and given a plain sentence per code.
 * That pane is the whole point of the review step: an importer that quietly
 * drops a third of a course is worse than one that refuses it.
 */

import type { StagedImport } from "./staging";
import type { ImportPath, LossReport, NoteCode, ScormImportPreview } from "./types";

/** One plain sentence per note code, for the "what was lost" pane. */
export const NOTE_DESCRIPTIONS: Record<NoteCode, string> = {
  depth_collapsed:
    "The package nested content deeper than modules, lessons and pages, so the extra levels were flattened and their titles folded into the page names.",
  item_dropped: "Entries in the package's contents list pointed at nothing and were skipped.",
  item_hidden: "Entries marked hidden in the package were imported anyway, so nothing is lost.",
  resource_missing: "Pages referenced content that is not in the package.",
  href_fragment_dropped:
    "Pages targeted a section within another page; this builder has one page per page, so the target was dropped.",
  href_query_dropped: "Launch parameters on a page were recorded but are not used.",
  external_sco: "Content hosted outside the package was linked rather than imported.",
  extra_organization_dropped:
    "The package offered more than one table of contents; only the default was imported.",
  empty_container_pruned: "Modules or lessons with no pages were removed.",
  page_escalated_to_embedded_html:
    "Pages could not be broken into editable blocks, so the original page and its files were preserved read-only.",
  layout_table_unwrapped:
    "Tables used for page layout rather than data were unwrapped into their contents.",
  decorative_image_skipped: "Spacer and bullet images were skipped.",
  internal_link_broken:
    "Links between pages inside the package could not be kept, because page addresses change on import.",
  iframe_dropped: "Embedded frames other than known video hosts were replaced with a link.",
  unmapped_elements: "Some page elements had no equivalent block type and were dropped.",
  asset_missing: "Images or files referenced by a page are not in the package.",
  asset_too_large: "Assets over the size limit were skipped.",
  asset_type_unsupported: "Assets of an unsupported type were skipped.",
  asset_degraded_data_url:
    "Blob storage is not configured, so assets were embedded inline instead of stored.",
  answer_key_unknown:
    "Quiz questions were imported with the first option marked correct, because the package does not say which answer is right. Check each one.",
  multi_select_downgraded:
    "Questions allowing several answers became single-answer questions; this builder has no multi-select type.",
  matching_order_unrecoverable:
    "A matching exercise's pairings could not be recovered and were imported in display order. Check them.",
  sidecar_version_newer:
    "The package was exported by a newer version of this app, so it was imported with reduced fidelity.",
  sidecar_malformed: "The package's round-trip data was unreadable, so its HTML was read instead.",
  scorm_2004_best_effort:
    "This is a SCORM 2004 package. Its structure and content imported, but sequencing rules were ignored.",
  zip_entry_rejected: "Unsafe or unusable entries in the archive were dropped.",
  suggestion: "Something worth a look, but nothing was changed.",
};

export interface LossGroup {
  code: NoteCode;
  count: number;
  description: string;
  locations: string[];
}

export function groupLoss(loss: LossReport): LossGroup[] {
  const byCode = new Map<NoteCode, string[]>();
  for (const note of loss.notes) {
    const list = byCode.get(note.code) ?? [];
    if (note.location) list.push(note.location);
    byCode.set(note.code, list);
  }
  return Array.from(byCode.entries())
    .map(([code, locations]) => ({
      code,
      count: loss.counts[code] ?? locations.length,
      description: NOTE_DESCRIPTIONS[code] ?? code,
      locations,
    }))
    .sort((a, b) => b.count - a.count);
}

function masteryScoreOf(scormMetadata: unknown): number | null {
  if (!scormMetadata || typeof scormMetadata !== "object") return null;
  const value = (scormMetadata as { masteryScore?: unknown }).masteryScore;
  return typeof value === "number" ? value : null;
}

function arrayLengthOf(scormMetadata: unknown, key: string): number {
  if (!scormMetadata || typeof scormMetadata !== "object") return 0;
  const value = (scormMetadata as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : 0;
}

export function buildPreview(staged: StagedImport, path: ImportPath): ScormImportPreview {
  const { course, loss, counts, warnings, importToken } = staged;

  return {
    importToken,
    path,
    roundTrip: path === "sidecar",
    fidelity: loss.fidelity,
    course: { title: course.title, overview: course.overview },
    counts,
    tree: course.modules.map((mod) => ({
      title: mod.title,
      lessons: mod.lessons.map((lesson) => ({
        title: lesson.title,
        pages: lesson.pages.map((page) => ({
          title: page.title,
          blockCount: page.blocks.length,
          embedded: page.blocks.some((b) => b.type === "embedded_html"),
          needsReview: page.blocks.some((b) => b.needsReview),
        })),
      })),
    })),
    assessment: {
      masteryScore: masteryScoreOf(course.scormMetadata),
      prerequisiteCount: arrayLengthOf(course.scormMetadata, "prerequisites"),
      objectiveCount: arrayLengthOf(course.scormMetadata, "objectives"),
    },
    loss,
    warnings,
  };
}
