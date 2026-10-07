/**
 * The round-trip test: export a course, re-import the package, assert the tree
 * that comes back is the tree that went in.
 *
 * Runs without a database or Blob storage. With BLOB_READ_WRITE_TOKEN unset,
 * asset ingestion degrades to data URLs, which is the code path that needs no
 * Prisma write, so `persistMedia: false` keeps this a pure unit test.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { buildScorm12Zip, type CourseForExport } from "../build-package";
import { SIDECAR_PATH } from "../sidecar";
import { importScormPackage, detectImportPath } from "./index";
import { openScormPackage } from "./unzip";
import type { ImportedCourseDraft } from "./types";

// A 1x1 transparent PNG, as a data URL. The exporter decodes data: images
// directly, so no network is involved.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

/**
 * A course covering every block type. Full type coverage is the point: a
 * round-trip test over three block types proves almost nothing.
 */
function richCourse(): CourseForExport {
  let order = 0;
  const next = () => order++;
  return {
    id: "course_rich",
    title: "Rich Course",
    overview: "Covers every block type.",
    audience: "Testers",
    tone: "Plain",
    complianceLevel: "standard",
    targetWordCount: 1200,
    brandConfig: { accent: "#ff7700" },
    ilos: ["Understand round trips", "Spot fidelity loss"],
    assessmentPlan: "One quiz per module.",
    interactionConfig: {
      enabledTypes: ["multiple_choice"],
      density: "moderate",
      placement: { withinLessons: true, endOfModule: true, finalAssessment: false },
      includeExplanations: true,
    },
    modules: [
      {
        id: "m1",
        title: "Module One",
        order: 0,
        lessons: [
          {
            id: "l1",
            title: "Lesson One",
            order: 0,
            pages: [
              {
                id: "p1",
                title: "Content types",
                order: 0,
                completionRules: { type: "all_blocks_viewed" },
                blocks: [
                  { id: "b_text", category: "content", type: "text", data: { text: "<p>Some <strong>bold</strong> and a <em>list</em>:</p><ul><li>one</li><li>two</li></ul>" }, order: next() },
                  { id: "b_head", category: "content", type: "heading", data: { level: 3, text: "A heading" }, order: next() },
                  { id: "b_img", category: "content", type: "image", data: { url: PNG_DATA_URL, alt: "A pixel", caption: "Figure 1" }, order: next() },
                  { id: "b_vid", category: "content", type: "video_embed", data: { url: "https://www.youtube.com/watch?v=abc123" }, order: next() },
                  { id: "b_ins", category: "content", type: "key_insight", data: { text: "<p>The insight.</p>" }, order: next() },
                  { id: "b_pt", category: "content", type: "key_point", data: { title: "Remember", text: "<p>The point.</p>" }, order: next() },
                  { id: "b_tbl", category: "content", type: "table", data: { html: '<table><thead><tr><th colspan="2">Head</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>' }, order: next() },
                ],
              },
            ],
          },
          {
            id: "l2",
            title: "Lesson Two",
            order: 1,
            pages: [
              {
                id: "p2",
                title: "Interactions",
                order: 0,
                completionRules: null,
                blocks: [
                  { id: "b_mc", category: "interaction", type: "multiple_choice", data: { question: "Which one?", options: ["First", "Second", "Third"], correctIndex: 2, explanation: "Because three." }, order: next() },
                  { id: "b_tf", category: "interaction", type: "true_false", data: { question: "Is it false?", correct: false, explanation: "It is." }, order: next() },
                  { id: "b_ref", category: "interaction", type: "reflection", data: { prompt: "What do you think?\nSecond line." }, order: next() },
                  { id: "b_dd", category: "interaction", type: "drag_and_drop", data: { question: "Order these", items: ["alpha", "beta", "gamma"], correctOrder: [2, 0, 1], explanation: "That order." }, order: next() },
                  { id: "b_mt", category: "interaction", type: "matching", data: { question: "Match them", pairs: [{ left: "L0", right: "R0" }, { left: "L1", right: "R1" }, { left: "L2", right: "R2" }], explanation: "Pairs." }, order: next() },
                  { id: "b_dc", category: "interaction", type: "dialog_cards", data: { title: "Cards", cards: [{ front: "Front A", back: "Back A" }, { front: "Front B", back: "Back B" }] }, order: next() },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "m2",
        title: "Module Two",
        order: 1,
        lessons: [
          {
            id: "l3",
            title: "Lesson Three",
            order: 0,
            pages: [
              {
                id: "p3",
                title: "Closing",
                order: 0,
                completionRules: { type: "mastery_score", masteryScore: 80 },
                blocks: [
                  { id: "b_text2", category: "content", type: "text", data: { text: "<p>Done.</p>" }, order: next() },
                ],
              },
            ],
          },
        ],
      },
    ],
  } as CourseForExport;
}

/** Strip ids and anything the round trip is allowed to change. */
function normalise(course: ImportedCourseDraft) {
  return {
    title: course.title,
    overview: course.overview,
    audience: course.audience,
    tone: course.tone,
    complianceLevel: course.complianceLevel,
    targetWordCount: course.targetWordCount,
    ilos: course.ilos,
    assessmentPlan: course.assessmentPlan,
    modules: course.modules.map((m) => ({
      title: m.title,
      lessons: m.lessons.map((l) => ({
        title: l.title,
        pages: l.pages.map((p) => ({
          title: p.title,
          completionRules: p.completionRules,
          blocks: p.blocks.map((b) => ({ category: b.category, type: b.type, data: b.data })),
        })),
      })),
    })),
  };
}

describe("export → import round trip", () => {
  let zipBytes: Buffer;
  let imported: Awaited<ReturnType<typeof importScormPackage>>;

  beforeAll(async () => {
    zipBytes = await buildScorm12Zip(richCourse());
    imported = await importScormPackage(zipBytes, { persistMedia: false });
  });

  it("runs against no real Blob store, so assets take the data-URL path", async () => {
    // Guards the guard: if test/setup.ts ever stops working, this test fails
    // rather than the suite quietly uploading to live storage.
    const { isBlobConfigured } = await import("@/lib/blob");
    expect(isBlobConfigured()).toBe(false);
  });

  it("writes the sidecar into the package and declares it in the manifest", async () => {
    const pkg = await openScormPackage(zipBytes);
    expect(pkg.has(SIDECAR_PATH)).toBe(true);

    const manifest = await pkg.readText("imsmanifest.xml");
    expect(manifest).toContain('href="scormcraft/course.json"');
    expect(manifest).toContain('adlcp:scormtype="asset"');
    // No <item> may reference it, or an LMS would let a learner launch it.
    expect(manifest).not.toContain('identifierref="res_scormcraft_sidecar"');
  });

  it("takes the sidecar path", async () => {
    const pkg = await openScormPackage(zipBytes);
    const detection = await detectImportPath(pkg);
    expect(detection.kind).toBe("sidecar");
    expect(imported.path).toBe("sidecar");
  });

  it("recovers the module/lesson/page hierarchy the flat manifest cannot express", () => {
    expect(imported.course.modules.map((m) => m.title)).toEqual(["Module One", "Module Two"]);
    expect(imported.course.modules[0].lessons.map((l) => l.title)).toEqual([
      "Lesson One",
      "Lesson Two",
    ]);
    expect(imported.counts.pages).toBe(3);
  });

  it("preserves every block type and its data", () => {
    const original = normalise({ ...richCourse() } as unknown as ImportedCourseDraft);
    const roundTripped = normalise(imported.course);

    // The image url is the one legitimate difference: the asset is re-ingested
    // from the zip, so it comes back as a fresh data URL rather than the
    // original string. Everything else must match exactly.
    const images = roundTripped.modules[0].lessons[0].pages[0].blocks.filter((b) => b.type === "image");
    expect(images).toHaveLength(1);
    expect(String(images[0].data.url)).toMatch(/^data:image\/png;base64,/);
    images[0].data.url = PNG_DATA_URL;

    expect(roundTripped).toEqual(original);
  });

  it("keeps the matching pairs in their original pairing, not the shuffled display order", () => {
    const matching = imported.course.modules[0].lessons[1].pages[0].blocks.find(
      (b) => b.type === "matching"
    );
    expect(matching?.data.pairs).toEqual([
      { left: "L0", right: "R0" },
      { left: "L1", right: "R1" },
      { left: "L2", right: "R2" },
    ]);
  });

  it("keeps answer keys, explanations and the drag order", () => {
    const blocks = imported.course.modules[0].lessons[1].pages[0].blocks;
    expect(blocks.find((b) => b.type === "multiple_choice")?.data).toMatchObject({
      correctIndex: 2,
      explanation: "Because three.",
    });
    expect(blocks.find((b) => b.type === "true_false")?.data).toMatchObject({ correct: false });
    expect(blocks.find((b) => b.type === "drag_and_drop")?.data).toMatchObject({
      correctOrder: [2, 0, 1],
    });
  });

  it("keeps table colspan, which the old export sanitiser stripped", () => {
    const table = imported.course.modules[0].lessons[0].pages[0].blocks.find(
      (b) => b.type === "table"
    );
    expect(String(table?.data.html)).toContain('colspan="2"');
  });

  it("keeps page completionRules", () => {
    expect(imported.course.modules[0].lessons[0].pages[0].completionRules).toEqual({
      type: "all_blocks_viewed",
    });
    expect(imported.course.modules[1].lessons[0].pages[0].completionRules).toEqual({
      type: "mastery_score",
      masteryScore: 80,
    });
  });

  it("reports lossless fidelity apart from the no-Blob asset degradation", () => {
    expect(imported.counts.blocks).toBe(14);
    expect(imported.counts.interactions).toBe(6);
    expect(imported.counts.needsReview).toBe(0);
    // The data-URL degradation is reported, not hidden.
    expect(imported.counts.assetsDegraded).toBe(1);
    expect(imported.warnings.join(" ")).toContain("Blob storage is not configured");
  });

  it("survives a second loop: export, import, export, import", async () => {
    const reExported = await buildScorm12Zip({
      ...richCourse(),
      // Re-export from the imported tree's content, as the app would after a
      // commit. Ids differ in reality; this checks the content survives twice.
      modules: imported.course.modules.map((m, mi) => ({
        id: `m${mi}`,
        title: m.title,
        order: mi,
        lessons: m.lessons.map((l, li) => ({
          id: `l${mi}_${li}`,
          title: l.title,
          order: li,
          pages: l.pages.map((p, pi) => ({
            id: `p${mi}_${li}_${pi}`,
            title: p.title,
            order: pi,
            completionRules: p.completionRules,
            blocks: p.blocks.map((b, bi) => ({
              id: `b${mi}_${li}_${pi}_${bi}`,
              category: b.category,
              type: b.type,
              data: b.data,
              order: bi,
            })),
          })),
        })),
      })),
    } as CourseForExport);

    const second = await importScormPackage(reExported, { persistMedia: false });
    expect(normalise(second.course)).toEqual(normalise(imported.course));
  });
});

describe("packages without a usable sidecar", () => {
  it("is refused rather than half-imported when the sidecar is omitted", async () => {
    const bytes = await buildScorm12Zip(richCourse(), { includeSidecar: false });
    const pkg = await openScormPackage(bytes);
    expect(pkg.has(SIDECAR_PATH)).toBe(false);

    const detection = await detectImportPath(pkg);
    // Our own generator meta is still in the HTML, so it is recognised as ours.
    expect(detection).toMatchObject({ kind: "own_export_html", reason: "sidecar_absent" });

    await expect(importScormPackage(bytes, { persistMedia: false })).rejects.toThrow(
      /not implemented yet/
    );
  });

  it("refuses a sidecar from a newer build instead of guessing", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await buildScorm12Zip(richCourse()));
    const sidecar = JSON.parse(await zip.file(SIDECAR_PATH)!.async("string"));
    sidecar.formatVersion = 99;
    zip.file(SIDECAR_PATH, JSON.stringify(sidecar));
    const bytes = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

    const detection = await detectImportPath(await openScormPackage(bytes));
    expect(detection).toMatchObject({ kind: "own_export_html", reason: "sidecar_too_new" });
    expect((detection as { detail: string }).detail).toContain("newer version");
  });
});
