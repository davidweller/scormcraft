/**
 * Shared shapes for SCORM package import.
 *
 * The importer always produces a full draft tree plus a loss report, and never
 * persists anything during analysis. The loss report is not diagnostic noise:
 * it is what the review step shows the user before they commit, and it is the
 * only honest answer to "what did this import throw away".
 */

export type ImportFidelity = "lossless" | "high" | "partial";

export type NoteCode =
  // structure
  | "depth_collapsed"
  | "item_dropped"
  | "item_hidden"
  | "resource_missing"
  | "href_fragment_dropped"
  | "href_query_dropped"
  | "external_sco"
  | "extra_organization_dropped"
  | "empty_container_pruned"
  // pages and content
  | "page_escalated_to_embedded_html"
  | "layout_table_unwrapped"
  | "decorative_image_skipped"
  | "internal_link_broken"
  | "iframe_dropped"
  | "unmapped_elements"
  // assets
  | "asset_missing"
  | "asset_too_large"
  | "asset_type_unsupported"
  | "asset_degraded_data_url"
  // interactions
  | "answer_key_unknown"
  | "multi_select_downgraded"
  | "matching_order_unrecoverable"
  // package-level
  | "sidecar_version_newer"
  | "sidecar_malformed"
  | "scorm_2004_best_effort"
  | "zip_entry_rejected"
  | "suggestion";

export interface ImportNote {
  code: NoteCode;
  /** The page or entry the note is about, where one applies. */
  location?: string;
  detail: string;
}

export interface LossReport {
  notes: ImportNote[];
  counts: Partial<Record<NoteCode, number>>;
  fidelity: ImportFidelity;
}

export function emptyLossReport(): LossReport {
  return { notes: [], counts: {}, fidelity: "lossless" };
}

export function addNote(report: LossReport, note: ImportNote): void {
  report.notes.push(note);
  report.counts[note.code] = (report.counts[note.code] ?? 0) + 1;
}

/**
 * Notes that mean content was changed or lost, rather than merely described.
 * Their presence is what downgrades fidelity below "high".
 */
const PARTIAL_FIDELITY_CODES: ReadonlySet<NoteCode> = new Set<NoteCode>([
  "item_dropped",
  "resource_missing",
  "asset_missing",
  "asset_too_large",
  "asset_type_unsupported",
  "answer_key_unknown",
  "multi_select_downgraded",
  "matching_order_unrecoverable",
  "page_escalated_to_embedded_html",
  "depth_collapsed",
  "unmapped_elements",
]);

export function resolveFidelity(report: LossReport, usedSidecar: boolean): ImportFidelity {
  const hasPartial = report.notes.some((n) => PARTIAL_FIDELITY_CODES.has(n.code));
  if (usedSidecar && !hasPartial) return "lossless";
  return hasPartial ? "partial" : "high";
}

/** A block ready to persist. Ids are assigned by the database, not carried over. */
export interface ImportedBlockDraft {
  category: "content" | "interaction";
  type: string;
  data: Record<string, unknown>;
  /** Set when a heuristic guessed at something a human should check. */
  needsReview?: boolean;
}

export interface ImportedPageDraft {
  title: string;
  completionRules: Record<string, unknown> | null;
  blocks: ImportedBlockDraft[];
  /** The page's href in the source package, for the loss report and provenance. */
  sourceHref?: string;
}

export interface ImportedLessonDraft {
  title: string;
  /** True when this lesson was invented to fill a level the package lacked. */
  synthetic?: boolean;
  pages: ImportedPageDraft[];
}

export interface ImportedModuleDraft {
  title: string;
  synthetic?: boolean;
  lessons: ImportedLessonDraft[];
}

export interface ImportedCourseDraft {
  title: string;
  overview: string | null;
  audience: string | null;
  tone: string | null;
  complianceLevel: string | null;
  targetWordCount: number | null;
  brandConfig: unknown;
  ilos: unknown;
  assessmentPlan: unknown;
  interactionConfig: unknown;
  scormMetadata: unknown;
  modules: ImportedModuleDraft[];
}

export type ImportPath = "sidecar" | "own_export_html" | "generic_html";

export interface ScormImportResult {
  course: ImportedCourseDraft;
  path: ImportPath;
  loss: LossReport;
  /** Set when analysis staged work under a token the commit step re-reads. */
  importToken?: string;
}

export interface ScormImportCounts {
  modules: number;
  lessons: number;
  pages: number;
  blocks: number;
  blocksByType: Record<string, number>;
  embeddedPages: number;
  interactions: number;
  needsReview: number;
  assetsIngested: number;
  assetsDegraded: number;
  assetsFailed: number;
}

export interface ScormImportPreviewPage {
  title: string;
  blockCount: number;
  embedded: boolean;
  needsReview: boolean;
}

export interface ScormImportPreview {
  importToken: string;
  path: ImportPath;
  roundTrip: boolean;
  fidelity: ImportFidelity;
  course: { title: string; overview: string | null };
  counts: ScormImportCounts;
  tree: {
    title: string;
    lessons: { title: string; pages: ScormImportPreviewPage[] }[];
  }[];
  assessment: {
    masteryScore: number | null;
    prerequisiteCount: number;
    objectiveCount: number;
  };
  loss: LossReport;
  warnings: string[];
}

export function countDraft(
  course: ImportedCourseDraft,
  assets: { ingested: number; degraded: number; failed: number }
): ScormImportCounts {
  const counts: ScormImportCounts = {
    modules: course.modules.length,
    lessons: 0,
    pages: 0,
    blocks: 0,
    blocksByType: {},
    embeddedPages: 0,
    interactions: 0,
    needsReview: 0,
    assetsIngested: assets.ingested,
    assetsDegraded: assets.degraded,
    assetsFailed: assets.failed,
  };

  for (const mod of course.modules) {
    counts.lessons += mod.lessons.length;
    for (const lesson of mod.lessons) {
      counts.pages += lesson.pages.length;
      for (const page of lesson.pages) {
        counts.blocks += page.blocks.length;
        if (page.blocks.some((b) => b.type === "embedded_html")) counts.embeddedPages += 1;
        for (const block of page.blocks) {
          counts.blocksByType[block.type] = (counts.blocksByType[block.type] ?? 0) + 1;
          if (block.category === "interaction") counts.interactions += 1;
          if (block.needsReview) counts.needsReview += 1;
        }
      }
    }
  }

  return counts;
}
