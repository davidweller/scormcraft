import { describe, expect, it } from "vitest";
import { NOTE_DESCRIPTIONS, buildPreview, groupLoss } from "./preview";
import type { StagedImport } from "./staging";
import {
  addNote,
  countDraft,
  emptyLossReport,
  resolveFidelity,
  type ImportedCourseDraft,
  type NoteCode,
} from "./types";

function course(): ImportedCourseDraft {
  return {
    title: "A course",
    overview: "Overview",
    audience: null,
    tone: null,
    complianceLevel: null,
    targetWordCount: null,
    brandConfig: null,
    ilos: null,
    assessmentPlan: null,
    interactionConfig: null,
    scormMetadata: { masteryScore: 80, objectives: [{ id: "o1" }], prerequisites: [] },
    modules: [
      {
        title: "Module 1",
        lessons: [
          {
            title: "Lesson 1",
            pages: [
              {
                title: "Page 1",
                completionRules: null,
                blocks: [
                  { category: "content", type: "text", data: {} },
                  { category: "interaction", type: "multiple_choice", data: {}, needsReview: true },
                ],
              },
              {
                title: "Preserved page",
                completionRules: null,
                blocks: [{ category: "content", type: "embedded_html", data: {} }],
              },
              { title: "Empty page", completionRules: null, blocks: [] },
            ],
          },
        ],
      },
    ],
  };
}

function stagedFrom(c: ImportedCourseDraft): StagedImport {
  const loss = emptyLossReport();
  addNote(loss, { code: "answer_key_unknown", location: "content/p1.html", detail: "x" });
  addNote(loss, { code: "answer_key_unknown", location: "content/p2.html", detail: "x" });
  addNote(loss, { code: "asset_missing", location: "images/a.png", detail: "x" });
  loss.fidelity = resolveFidelity(loss, false);

  return {
    importToken: "a".repeat(40),
    stagedAt: new Date().toISOString(),
    packageFilename: "course.zip",
    packageBytes: 999,
    course: c,
    loss,
    counts: countDraft(c, { ingested: 2, degraded: 1, failed: 1 }),
    warnings: ["1 asset(s) could not be imported."],
  };
}

describe("countDraft", () => {
  it("counts the tree, interactions, embedded pages and review flags", () => {
    const counts = countDraft(course(), { ingested: 2, degraded: 1, failed: 1 });
    expect(counts).toMatchObject({
      modules: 1,
      lessons: 1,
      pages: 3,
      blocks: 3,
      embeddedPages: 1,
      interactions: 1,
      needsReview: 1,
      assetsIngested: 2,
      assetsDegraded: 1,
      assetsFailed: 1,
    });
    expect(counts.blocksByType).toEqual({ text: 1, multiple_choice: 1, embedded_html: 1 });
  });
});

describe("resolveFidelity", () => {
  it("is lossless only on the sidecar path with nothing lost", () => {
    expect(resolveFidelity(emptyLossReport(), true)).toBe("lossless");
  });

  it("is high when nothing was lost but HTML was parsed", () => {
    expect(resolveFidelity(emptyLossReport(), false)).toBe("high");
  });

  it("is partial once content was changed or dropped, even via the sidecar", () => {
    const loss = emptyLossReport();
    addNote(loss, { code: "asset_missing", detail: "x" });
    expect(resolveFidelity(loss, true)).toBe("partial");
  });

  it("stays lossless for notes that only describe, never alter", () => {
    const loss = emptyLossReport();
    addNote(loss, { code: "item_hidden", detail: "x" });
    addNote(loss, { code: "suggestion", detail: "x" });
    expect(resolveFidelity(loss, true)).toBe("lossless");
  });
});

describe("groupLoss", () => {
  it("groups by code, counts, and orders worst first", () => {
    const groups = groupLoss(stagedFrom(course()).loss);
    expect(groups[0]).toMatchObject({ code: "answer_key_unknown", count: 2 });
    expect(groups[0].locations).toEqual(["content/p1.html", "content/p2.html"]);
    expect(groups.map((g) => g.code)).toEqual(["answer_key_unknown", "asset_missing"]);
  });

  it("gives every code a plain-language description", () => {
    const groups = groupLoss(stagedFrom(course()).loss);
    for (const group of groups) {
      expect(group.description).toBe(NOTE_DESCRIPTIONS[group.code]);
      expect(group.description).not.toBe(group.code);
    }
  });
});

describe("NOTE_DESCRIPTIONS", () => {
  it("covers every note code, so the review pane never shows a bare slug", () => {
    const codes: NoteCode[] = [
      "depth_collapsed", "item_dropped", "item_hidden", "resource_missing",
      "href_fragment_dropped", "href_query_dropped", "external_sco",
      "extra_organization_dropped", "empty_container_pruned",
      "page_escalated_to_embedded_html", "layout_table_unwrapped",
      "decorative_image_skipped", "internal_link_broken", "iframe_dropped",
      "unmapped_elements", "asset_missing", "asset_too_large",
      "asset_type_unsupported", "asset_degraded_data_url", "answer_key_unknown",
      "multi_select_downgraded", "matching_order_unrecoverable",
      "sidecar_version_newer", "sidecar_malformed", "scorm_2004_best_effort",
      "zip_entry_rejected", "suggestion",
    ];
    for (const code of codes) {
      expect(NOTE_DESCRIPTIONS[code], code).toBeTruthy();
    }
    expect(Object.keys(NOTE_DESCRIPTIONS).sort()).toEqual([...codes].sort());
  });
});

describe("buildPreview", () => {
  it("reports the tree with per-page badges the reviewer needs", () => {
    const preview = buildPreview(stagedFrom(course()), "generic_html");
    const pages = preview.tree[0].lessons[0].pages;
    expect(pages[0]).toEqual({ title: "Page 1", blockCount: 2, embedded: false, needsReview: true });
    expect(pages[1]).toEqual({ title: "Preserved page", blockCount: 1, embedded: true, needsReview: false });
    expect(pages[2]).toEqual({ title: "Empty page", blockCount: 0, embedded: false, needsReview: false });
  });

  it("flags a round trip only on the sidecar path", () => {
    expect(buildPreview(stagedFrom(course()), "sidecar").roundTrip).toBe(true);
    expect(buildPreview(stagedFrom(course()), "own_export_html").roundTrip).toBe(false);
    expect(buildPreview(stagedFrom(course()), "generic_html").roundTrip).toBe(false);
  });

  it("surfaces the assessment metadata", () => {
    expect(buildPreview(stagedFrom(course()), "sidecar").assessment).toEqual({
      masteryScore: 80,
      prerequisiteCount: 0,
      objectiveCount: 1,
    });
  });

  it("tolerates missing assessment metadata", () => {
    const c = { ...course(), scormMetadata: null };
    expect(buildPreview(stagedFrom(c), "sidecar").assessment).toEqual({
      masteryScore: null,
      prerequisiteCount: 0,
      objectiveCount: 0,
    });
  });
});
