/**
 * The export sidecar: a machine-readable copy of the course tree, written into
 * every SCORM package so the package can be imported back losslessly.
 *
 * The manifest alone is not enough. buildManifest12 emits a flat <item> list,
 * so the module/lesson hierarchy is not recoverable from it, and rendered HTML
 * loses field-level detail (a file's byte size, a heading's original level).
 * The sidecar is the authoritative round-trip format; HTML parsing is the
 * fallback for packages that do not have one.
 *
 * It is declared in the manifest as an `asset` resource with no <item>
 * referencing it, so an LMS that prunes unreferenced files leaves it alone and
 * no learner can launch it.
 */

import type { BrandConfig } from "@/types/branding";
import type { BlockForExport, CourseForExport } from "./build-package";

export const SIDECAR_PATH = "scormcraft/course.json";
export const SIDECAR_FORMAT_VERSION = 1;

export type SidecarAssetKind = "image" | "video" | "file" | "logo" | "embedded";

export interface SidecarAsset {
  /** Path inside the package, relative to the package root. */
  zipPath: string;
  kind: SidecarAssetKind;
  /** Original filename, used for the Media row the importer recreates. */
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  alt?: string;
}

export interface SidecarBlock {
  /** Original cuid. Provenance and correlation only — never reused on insert. */
  id: string;
  category: "content" | "interaction";
  type: string;
  /**
   * Asset-bearing urls here are ZIP-RELATIVE paths, not Blob urls.
   *
   * These are the blocks as rewritten for rendering, after
   * rewriteImageUrls/rewriteVideoUrls/rewriteFileUrls. Blob urls are dead the
   * moment the package is imported onto another deployment, and `data:` urls
   * would double the package size for bytes already present as
   * content/img_N.png. The importer re-ingests from the zip instead.
   */
  data: Record<string, unknown>;
  order: number;
}

export interface SidecarPage {
  id: string;
  title: string;
  order: number;
  completionRules: Record<string, unknown> | null;
  /** The page's href in the manifest, tying the sidecar to the package. */
  href: string;
  blocks: SidecarBlock[];
}

export interface SidecarLesson {
  id: string;
  title: string;
  order: number;
  pages: SidecarPage[];
}

export interface SidecarModule {
  id: string;
  title: string;
  order: number;
  lessons: SidecarLesson[];
}

export interface SidecarCourse {
  id: string;
  title: string;
  overview: string | null;
  audience: string | null;
  tone: string | null;
  complianceLevel: string | null;
  targetWordCount: number | null;
  brandConfig: BrandConfig | null;
  ilos: unknown;
  assessmentPlan: unknown;
  interactionConfig: unknown;
  scormMetadata: unknown;
  modules: SidecarModule[];
}

export interface Sidecar {
  formatVersion: number;
  generator: { name: "scormcraft"; appVersion: string };
  exportedAt: string;
  scorm: { version: "1.2"; manifestIdentifier: string };
  course: SidecarCourse;
  assets: SidecarAsset[];
}

export interface BuildSidecarInput {
  course: CourseForExport;
  /** Pages in export order, carrying their rewritten blocks and href. */
  pages: SidecarPage[];
  assets: SidecarAsset[];
  manifestIdentifier: string;
  appVersion: string;
  exportedAt?: Date;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A page's blocks, trimmed to the fields the sidecar carries. */
export function toSidecarBlocks(blocks: BlockForExport[]): SidecarBlock[] {
  return [...blocks]
    .sort((a, b) => a.order - b.order)
    .map((block) => ({
      id: block.id,
      category: block.category,
      type: block.type,
      data: block.data ?? {},
      order: block.order,
    }));
}

/**
 * Build the sidecar.
 *
 * Course fields are listed explicitly and never spread from the Prisma row.
 * `Course.settings` holds `{ apiKeys: { openai } }`; a spread would publish a
 * user's API key inside every exported package. This allowlist is the only
 * thing standing between the two, so do not replace it with `...course`.
 */
export function buildSidecar(input: BuildSidecarInput): Sidecar {
  const { course, pages, assets, manifestIdentifier, appVersion } = input;

  const pagesById = new Map(pages.map((p) => [p.id, p]));

  const modules: SidecarModule[] = (course.modules ?? []).map((mod, moduleIdx) => ({
    id: mod.id,
    title: mod.title,
    order: typeof mod.order === "number" ? mod.order : moduleIdx,
    lessons: (mod.lessons ?? []).map((lesson, lessonIdx) => ({
      id: lesson.id,
      title: lesson.title,
      order: typeof lesson.order === "number" ? lesson.order : lessonIdx,
      pages: (lesson.pages ?? [])
        .map((page) => pagesById.get(page.id))
        .filter((p): p is SidecarPage => Boolean(p)),
    })),
  }));

  return {
    formatVersion: SIDECAR_FORMAT_VERSION,
    generator: { name: "scormcraft", appVersion },
    exportedAt: (input.exportedAt ?? new Date()).toISOString(),
    scorm: { version: "1.2", manifestIdentifier },
    course: {
      id: course.id,
      title: course.title,
      overview: course.overview ?? null,
      audience: course.audience ?? null,
      tone: course.tone ?? null,
      complianceLevel: course.complianceLevel ?? null,
      targetWordCount: course.targetWordCount ?? null,
      brandConfig: course.brandConfig ?? null,
      ilos: course.ilos ?? null,
      assessmentPlan: course.assessmentPlan ?? null,
      interactionConfig: course.interactionConfig ?? null,
      scormMetadata: course.scormMetadata ?? null,
      modules,
      // NOTE: `settings` is deliberately absent. See the doc comment above.
    },
    assets,
  };
}

export function serialiseSidecar(sidecar: Sidecar): string {
  return JSON.stringify(sidecar, null, 2);
}

/**
 * Structural guard for a parsed sidecar.
 *
 * Hand-written rather than schema-validated: there is no Zod in this project,
 * and adding it for one file is not worth the dependency. Unknown extra keys
 * are tolerated so that a sidecar from a slightly different build still loads.
 */
export function isSidecar(value: unknown): value is Sidecar {
  const root = asRecord(value);
  if (!root) return false;
  if (typeof root.formatVersion !== "number") return false;

  const course = asRecord(root.course);
  if (!course) return false;
  if (typeof course.title !== "string") return false;
  if (!Array.isArray(course.modules)) return false;

  for (const mod of course.modules) {
    const m = asRecord(mod);
    if (!m || typeof m.title !== "string" || !Array.isArray(m.lessons)) return false;
    for (const lesson of m.lessons) {
      const l = asRecord(lesson);
      if (!l || typeof l.title !== "string" || !Array.isArray(l.pages)) return false;
      for (const page of l.pages) {
        const p = asRecord(page);
        if (!p || typeof p.title !== "string" || !Array.isArray(p.blocks)) return false;
        for (const block of p.blocks) {
          const b = asRecord(block);
          if (!b) return false;
          if (b.category !== "content" && b.category !== "interaction") return false;
          if (typeof b.type !== "string") return false;
        }
      }
    }
  }

  if (root.assets !== undefined && !Array.isArray(root.assets)) return false;
  return true;
}

export type SidecarReadOutcome =
  | { status: "ok"; sidecar: Sidecar }
  | { status: "absent" }
  | { status: "malformed"; reason: string }
  | { status: "too_new"; formatVersion: number };

/**
 * Migration chain for older sidecar formats, one pure function per step.
 *
 * Empty today — there is only format 1. The dispatch point exists from the
 * start because a migration added later to a format that never had one is a
 * migration that does not get written.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

function migrateSidecar(raw: Record<string, unknown>): Record<string, unknown> {
  let current = raw;
  let version = typeof current.formatVersion === "number" ? current.formatVersion : 0;
  while (version < SIDECAR_FORMAT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    current = step(current);
    const next = typeof current.formatVersion === "number" ? current.formatVersion : version + 1;
    if (next <= version) break; // a migration that does not advance would loop
    version = next;
  }
  return current;
}

/**
 * Parse a sidecar's JSON text.
 *
 * Never throws: a package with a broken sidecar is still importable through the
 * HTML path, so every failure mode has to be reportable rather than fatal.
 *
 * A sidecar from a NEWER build is refused rather than best-effort parsed. It
 * may encode block types this build cannot store, and silently dropping them
 * produces a corrupt course that looks fine.
 */
export function readSidecar(json: string): SidecarReadOutcome {
  if (!json.trim()) return { status: "absent" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { status: "malformed", reason: e instanceof Error ? e.message : "invalid JSON" };
  }

  const root = asRecord(parsed);
  if (!root) return { status: "malformed", reason: "sidecar root is not an object" };
  if (typeof root.formatVersion !== "number") {
    return { status: "malformed", reason: "sidecar has no formatVersion" };
  }
  if (root.formatVersion > SIDECAR_FORMAT_VERSION) {
    return { status: "too_new", formatVersion: root.formatVersion };
  }

  const migrated = migrateSidecar(root);
  if (!isSidecar(migrated)) {
    return { status: "malformed", reason: "sidecar failed structural validation" };
  }
  return { status: "ok", sidecar: migrated };
}
