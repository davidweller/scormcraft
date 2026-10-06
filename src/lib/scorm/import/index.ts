/**
 * SCORM package import: detection and orchestration.
 *
 * Three paths, in descending fidelity:
 *   1. the round-trip sidecar          — lossless, no HTML parsed
 *   2. our own rendered HTML           — exact for packages we made whose
 *                                        sidecar an LMS stripped
 *   3. generic HTML                    — heuristic, with a loss report
 *
 * Paths 2 and 3 arrive with Phase 3; until then a package without a usable
 * sidecar is reported as unsupported rather than half-imported.
 */

import { GENERATOR_ID } from "../render-page-html";
import { SIDECAR_PATH, readSidecar, type Sidecar } from "../sidecar";
import { importFromSidecar } from "./from-sidecar";
import { openScormPackage, type ScormPackage, type ZipLimits } from "./unzip";
import {
  addNote,
  countDraft,
  type ImportPath,
  type LossReport,
  type ScormImportCounts,
  type ScormImportResult,
} from "./types";

export { ScormPackageError, openScormPackage } from "./unzip";
export type { ScormPackage } from "./unzip";

export type SidecarDetection =
  | { kind: "sidecar"; sidecar: Sidecar }
  | { kind: "own_export_html"; reason: "sidecar_absent" | "sidecar_malformed" | "sidecar_too_new"; detail: string }
  | { kind: "generic_html"; detail: string };

/** Does any page in the package claim our generator? */
async function looksLikeOwnExport(pkg: ScormPackage): Promise<boolean> {
  const pages = pkg
    .list()
    .filter((p) => /\.x?html?$/i.test(p))
    // Checking a handful is enough; reading every page of a 300-page package
    // to answer a yes/no question is not.
    .slice(0, 5);

  for (const page of pages) {
    try {
      const html = await pkg.readText(page);
      if (html.includes(`content="${GENERATOR_ID}"`) || html.includes("data-sc-type=")) {
        return true;
      }
    } catch {
      // An unreadable page tells us nothing; keep looking.
    }
  }
  return false;
}

/**
 * Decide which import path a package takes.
 *
 * Never throws. A broken sidecar is a reason to fall back and warn, not to
 * refuse the package: the HTML is still there.
 */
export async function detectImportPath(pkg: ScormPackage): Promise<SidecarDetection> {
  if (pkg.has(SIDECAR_PATH)) {
    let json = "";
    try {
      json = await pkg.readText(SIDECAR_PATH);
    } catch (e) {
      return {
        kind: "own_export_html",
        reason: "sidecar_malformed",
        detail: `Sidecar could not be read: ${e instanceof Error ? e.message : "error"}`,
      };
    }

    const outcome = readSidecar(json);
    if (outcome.status === "ok") return { kind: "sidecar", sidecar: outcome.sidecar };

    if (outcome.status === "too_new") {
      return {
        kind: "own_export_html",
        reason: "sidecar_too_new",
        // Deliberately not best-effort parsed: a newer sidecar may encode block
        // types this build cannot store, and dropping them silently produces a
        // corrupt course that looks fine.
        detail: `Package was exported by a newer version of this app (sidecar format ${outcome.formatVersion}). Imported with reduced fidelity; upgrade to import it losslessly.`,
      };
    }
    if (outcome.status === "malformed") {
      return {
        kind: "own_export_html",
        reason: "sidecar_malformed",
        detail: `Sidecar present but unusable (${outcome.reason}). Falling back to reading the package's HTML.`,
      };
    }
  }

  if (await looksLikeOwnExport(pkg)) {
    return {
      kind: "own_export_html",
      reason: "sidecar_absent",
      detail:
        "Package was produced by this app but its sidecar is missing, so the course was reconstructed from the page markup.",
    };
  }

  return { kind: "generic_html", detail: "Package will be read from its manifest and page HTML." };
}

export class ScormImportUnsupportedError extends Error {
  constructor(message: string, readonly path: ImportPath) {
    super(message);
    this.name = "ScormImportUnsupportedError";
  }
}

export interface ImportScormOptions {
  /** False during analysis dry runs that must not write Media rows. */
  persistMedia?: boolean;
  zipLimits?: Partial<ZipLimits>;
}

export interface ScormImportAnalysis extends ScormImportResult {
  counts: ScormImportCounts;
  warnings: string[];
}

export async function importScormPackage(
  bytes: Buffer,
  options: ImportScormOptions = {}
): Promise<ScormImportAnalysis> {
  const pkg = await openScormPackage(bytes, options.zipLimits);
  const detection = await detectImportPath(pkg);

  if (detection.kind !== "sidecar") {
    // Phase 3 replaces this with the manifest + HTML pipeline. Failing loudly
    // is better than returning an empty course that looks like a success.
    throw new ScormImportUnsupportedError(
      detection.kind === "own_export_html"
        ? `${detection.detail} Reading packages without a usable sidecar is not implemented yet.`
        : "This package has no round-trip data. Importing third-party SCORM packages is not implemented yet.",
      detection.kind === "own_export_html" ? "own_export_html" : "generic_html"
    );
  }

  const { course, loss, assetStats } = await importFromSidecar({
    pkg,
    sidecar: detection.sidecar,
    persistMedia: options.persistMedia,
  });

  return {
    course,
    path: "sidecar",
    loss,
    counts: countDraft(course, assetStats),
    warnings: collectWarnings(loss),
  };
}

function collectWarnings(loss: LossReport): string[] {
  const warnings: string[] = [];
  if (loss.counts.asset_degraded_data_url) {
    warnings.push(
      `${loss.counts.asset_degraded_data_url} asset(s) were inlined because Blob storage is not configured.`
    );
  }
  if (loss.counts.asset_missing || loss.counts.asset_too_large) {
    warnings.push(
      `${(loss.counts.asset_missing ?? 0) + (loss.counts.asset_too_large ?? 0)} asset(s) could not be imported.`
    );
  }
  return warnings;
}

export { addNote };
