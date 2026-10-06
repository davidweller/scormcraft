import { describe, expect, it } from "vitest";
import {
  SIDECAR_FORMAT_VERSION,
  buildSidecar,
  isSidecar,
  readSidecar,
  serialiseSidecar,
  toSidecarBlocks,
} from "./sidecar";
import type { CourseForExport } from "./build-package";

function course(extra: Record<string, unknown> = {}): CourseForExport {
  return {
    id: "course1",
    title: "Test course",
    overview: "An overview",
    audience: "Managers",
    tone: "Direct",
    brandConfig: { logoUrl: "https://e.com/l.png" },
    ilos: ["a", "b"],
    assessmentPlan: "A plan",
    modules: [
      {
        id: "m1",
        title: "Module 1",
        order: 0,
        lessons: [{ id: "l1", title: "Lesson 1", order: 0, pages: [{ id: "p1", title: "Page 1", blocks: [] }] }],
      },
    ],
    ...extra,
  } as CourseForExport;
}

const page = {
  id: "p1",
  title: "Page 1",
  order: 0,
  completionRules: null,
  href: "content/page_0.html",
  blocks: [{ id: "b1", category: "content" as const, type: "text", data: { text: "<p>hi</p>" }, order: 0 }],
};

describe("buildSidecar", () => {
  it("carries the course tree and asset list", () => {
    const sidecar = buildSidecar({
      course: course(),
      pages: [page],
      assets: [
        { zipPath: "content/img_0.png", kind: "image", filename: "a.png", mimeType: "image/png", size: 10 },
      ],
      manifestIdentifier: "course1",
      appVersion: "9.9.9",
    });

    expect(sidecar.formatVersion).toBe(SIDECAR_FORMAT_VERSION);
    expect(sidecar.generator).toEqual({ name: "scormcraft", appVersion: "9.9.9" });
    expect(sidecar.course.modules[0].lessons[0].pages[0].blocks[0].data).toEqual({ text: "<p>hi</p>" });
    expect(sidecar.assets).toHaveLength(1);
  });

  it("NEVER includes course.settings, which holds the user's API key", () => {
    const withSecret = course({ settings: { apiKeys: { openai: "fake-key-for-leak-test" } } });
    const json = serialiseSidecar(
      buildSidecar({
        course: withSecret,
        pages: [page],
        assets: [],
        manifestIdentifier: "course1",
        appVersion: "1",
      })
    );
    expect(json).not.toContain("fake-key-for-leak-test");
    expect(json).not.toContain("apiKeys");
    expect(json).not.toContain("settings");
  });

  it("omits pages the export did not emit", () => {
    const sidecar = buildSidecar({
      course: course(),
      pages: [], // nothing rendered
      assets: [],
      manifestIdentifier: "course1",
      appVersion: "1",
    });
    expect(sidecar.course.modules[0].lessons[0].pages).toEqual([]);
  });
});

describe("toSidecarBlocks", () => {
  it("sorts by order and drops fields the sidecar does not carry", () => {
    const blocks = toSidecarBlocks([
      { id: "b2", category: "content", type: "heading", data: { text: "B" }, order: 1 },
      { id: "b1", category: "content", type: "text", data: { text: "A" }, order: 0 },
    ]);
    expect(blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(Object.keys(blocks[0]).sort()).toEqual(["category", "data", "id", "order", "type"]);
  });
});

describe("readSidecar", () => {
  const valid = () =>
    serialiseSidecar(
      buildSidecar({
        course: course(),
        pages: [page],
        assets: [],
        manifestIdentifier: "course1",
        appVersion: "1",
      })
    );

  it("round-trips a valid sidecar", () => {
    const outcome = readSidecar(valid());
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.sidecar.course.title).toBe("Test course");
    }
  });

  it("refuses a sidecar from a newer build rather than guessing", () => {
    const bumped = JSON.parse(valid());
    bumped.formatVersion = SIDECAR_FORMAT_VERSION + 1;
    const outcome = readSidecar(JSON.stringify(bumped));
    expect(outcome).toEqual({ status: "too_new", formatVersion: SIDECAR_FORMAT_VERSION + 1 });
  });

  it("reports malformed JSON without throwing", () => {
    const outcome = readSidecar("{not json");
    expect(outcome.status).toBe("malformed");
  });

  it("reports a missing formatVersion", () => {
    const outcome = readSidecar(JSON.stringify({ course: { title: "x", modules: [] } }));
    expect(outcome).toMatchObject({ status: "malformed", reason: "sidecar has no formatVersion" });
  });

  it("reports a structurally wrong sidecar", () => {
    const outcome = readSidecar(JSON.stringify({ formatVersion: 1, course: { title: "x" } }));
    expect(outcome.status).toBe("malformed");
  });

  it("treats an empty file as absent", () => {
    expect(readSidecar("   ")).toEqual({ status: "absent" });
  });
});

describe("isSidecar", () => {
  it("tolerates unknown extra keys", () => {
    const raw = JSON.parse(
      serialiseSidecar(
        buildSidecar({
          course: course(),
          pages: [page],
          assets: [],
          manifestIdentifier: "c",
          appVersion: "1",
        })
      )
    );
    raw.somethingFromTheFuture = { a: 1 };
    expect(isSidecar(raw)).toBe(true);
  });

  it("rejects a block with an unknown category", () => {
    const raw = JSON.parse(
      serialiseSidecar(
        buildSidecar({
          course: course(),
          pages: [page],
          assets: [],
          manifestIdentifier: "c",
          appVersion: "1",
        })
      )
    );
    raw.course.modules[0].lessons[0].pages[0].blocks[0].category = "nonsense";
    expect(isSidecar(raw)).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isSidecar(null)).toBe(false);
    expect(isSidecar([])).toBe(false);
    expect(isSidecar("x")).toBe(false);
  });
});
