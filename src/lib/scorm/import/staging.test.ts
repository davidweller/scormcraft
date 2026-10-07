import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  discardStagedImport,
  isValidImportToken,
  newImportToken,
  packagePath,
  readStagedImport,
  stageImport,
  stagingPath,
  type StagedImport,
} from "./staging";
import { emptyLossReport, type ImportedCourseDraft } from "./types";

function draft(): ImportedCourseDraft {
  return {
    title: "Staged course",
    overview: null,
    audience: null,
    tone: null,
    complianceLevel: null,
    targetWordCount: null,
    brandConfig: null,
    ilos: null,
    assessmentPlan: null,
    interactionConfig: null,
    scormMetadata: null,
    modules: [],
  };
}

function staged(importToken: string): StagedImport {
  return {
    importToken,
    stagedAt: new Date().toISOString(),
    packageFilename: "course.zip",
    packageBytes: 1234,
    course: draft(),
    loss: emptyLossReport(),
    counts: {
      modules: 0,
      lessons: 0,
      pages: 0,
      blocks: 0,
      blocksByType: {},
      embeddedPages: 0,
      interactions: 0,
      needsReview: 0,
      assetsIngested: 0,
      assetsDegraded: 0,
      assetsFailed: 0,
    },
    warnings: [],
  };
}

describe("newImportToken", () => {
  it("produces 40 hex characters and does not repeat", () => {
    const a = newImportToken();
    const b = newImportToken();
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(a).not.toBe(b);
  });
});

describe("isValidImportToken", () => {
  it("accepts a well-formed token", () => {
    expect(isValidImportToken(newImportToken())).toBe(true);
  });

  it("rejects anything that could escape a Blob path", () => {
    // This guard is the only thing between a client string and an interpolated
    // storage path, so it has to refuse traversal and separators outright.
    for (const bad of [
      "../../etc/passwd",
      "a".repeat(39),
      "a".repeat(41),
      "ABCDEF0123456789abcdef0123456789abcdef01", // uppercase
      "0123456789abcdef0123456789abcdef0123456/",
      "",
      null,
      undefined,
      42,
      { toString: () => "0".repeat(40) },
    ]) {
      expect(isValidImportToken(bad)).toBe(false);
    }
  });
});

describe("path builders", () => {
  it("derive both paths from the token alone", () => {
    const token = "a".repeat(40);
    expect(stagingPath(token)).toBe(`imports/scorm/${token}/staged.json`);
    // Deterministic, so /analyze can find the package without being handed a
    // url by the client.
    expect(packagePath(token)).toBe(`imports/scorm/${token}/package.zip`);
  });
});

describe("staging with no Blob store (local development)", () => {
  it("round-trips through the in-process store", async () => {
    const token = newImportToken();
    await stageImport(staged(token));
    const read = await readStagedImport(token);
    expect(read?.course.title).toBe("Staged course");
  });

  it("returns null for an unknown token", async () => {
    expect(await readStagedImport(newImportToken())).toBeNull();
  });

  it("returns null for a malformed token rather than building a path from it", async () => {
    expect(await readStagedImport("../../../etc/passwd")).toBeNull();
  });

  it("discards on commit, so a second commit cannot reuse the token", async () => {
    const token = newImportToken();
    await stageImport(staged(token));
    await discardStagedImport(token);
    expect(await readStagedImport(token)).toBeNull();
  });
});

describe("staging expiry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("drops an abandoned import after its TTL", async () => {
    const token = newImportToken();
    await stageImport(staged(token));
    expect(await readStagedImport(token)).not.toBeNull();

    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    expect(await readStagedImport(token)).toBeNull();
  });
});
