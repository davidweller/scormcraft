/**
 * Lossless import from a package's round-trip sidecar.
 *
 * No HTML is parsed on this path. The sidecar already holds the exact block
 * data that produced the package, so the only work is re-ingesting the assets
 * out of the zip and pointing the block urls at their new homes.
 */

import { isHtmlField } from "@/lib/html/allowlist";
import { sanitizeImportedRichText } from "@/lib/html/sanitize";
import type { Sidecar, SidecarAsset, SidecarBlock } from "../sidecar";
import { ingestAsset, type AssetKind, type IngestContext } from "./assets";
import type { ScormPackage } from "./unzip";
import {
  addNote,
  emptyLossReport,
  resolveFidelity,
  type ImportedBlockDraft,
  type ImportedCourseDraft,
  type ImportedModuleDraft,
  type LossReport,
} from "./types";

/** Block data fields that hold an asset url, by block type. */
const ASSET_FIELDS: Record<string, { field: "url"; kind: AssetKind }> = {
  image: { field: "url", kind: "image" },
  video_embed: { field: "url", kind: "video" },
  file_download: { field: "url", kind: "file" },
};

function assetsByZipPath(assets: SidecarAsset[]): Map<string, SidecarAsset> {
  return new Map(assets.map((a) => [a.zipPath, a]));
}

/**
 * A sidecar url is zip-relative because it was rewritten for packaging. Page
 * HTML sits in content/, so a bare "img_0.png" means "content/img_0.png".
 */
function toZipPath(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("content/")) return trimmed;
  return `content/${trimmed}`;
}

function isExternalUrl(url: string): boolean {
  return /^(https?:|data:)/i.test(url.trim());
}

/**
 * Re-sanitise every HTML-bearing field.
 *
 * The sidecar came out of our own exporter, but a package is a file a user can
 * edit, so its contents are untrusted on the way back in. Sanitising here means
 * the database only ever holds clean HTML.
 */
function sanitiseBlockData(block: SidecarBlock): Record<string, unknown> {
  const data: Record<string, unknown> = { ...block.data };
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && isHtmlField(block.type, key)) {
      data[key] = sanitizeImportedRichText(value);
    }
  }
  return data;
}

export interface SidecarImportOptions {
  pkg: ScormPackage;
  sidecar: Sidecar;
  /** False during a dry run, to avoid writing Media rows. */
  persistMedia?: boolean;
}

export interface SidecarImportOutcome {
  course: ImportedCourseDraft;
  loss: LossReport;
  assetStats: { ingested: number; degraded: number; failed: number };
}

export async function importFromSidecar(
  options: SidecarImportOptions
): Promise<SidecarImportOutcome> {
  const { pkg, sidecar } = options;
  const loss = emptyLossReport();
  const assetMeta = assetsByZipPath(sidecar.assets ?? []);

  const ctx: IngestContext = {
    pkg,
    cache: new Map(),
    skips: [],
    persistMedia: options.persistMedia,
  };

  for (const rejected of pkg.rejectedEntries()) {
    addNote(loss, {
      code: "zip_entry_rejected",
      location: rejected.name,
      detail: `Archive entry dropped (${rejected.reason}).`,
    });
  }

  const modules: ImportedModuleDraft[] = [];

  for (const mod of sidecar.course.modules ?? []) {
    const lessons = [];
    for (const lesson of mod.lessons ?? []) {
      const pages = [];
      for (const page of lesson.pages ?? []) {
        const blocks: ImportedBlockDraft[] = [];

        for (const block of page.blocks ?? []) {
          const data = sanitiseBlockData(block);
          const assetField = ASSET_FIELDS[block.type];

          if (assetField) {
            const rawUrl = typeof data[assetField.field] === "string" ? (data[assetField.field] as string) : "";
            if (rawUrl && !isExternalUrl(rawUrl)) {
              const zipPath = toZipPath(rawUrl);
              const meta = assetMeta.get(zipPath);
              const ingested = await ingestAsset(ctx, zipPath, {
                kind: assetField.kind,
                alt: meta?.alt ?? (typeof data.alt === "string" ? data.alt : undefined),
              });

              if (ingested) {
                data[assetField.field] = ingested.url;
                // The sidecar is authoritative for metadata the bytes cannot
                // supply: a download's original filename and reported size.
                if (block.type === "file_download") {
                  data.filename = meta?.filename ?? ingested.filename;
                  data.mimeType = meta?.mimeType ?? ingested.mimeType;
                  data.size = meta?.size ?? ingested.size;
                }
                if (ingested.degraded) {
                  addNote(loss, {
                    code: "asset_degraded_data_url",
                    location: zipPath,
                    detail:
                      "Blob storage is not configured, so this asset was inlined as a data URL.",
                  });
                }
              } else {
                // Keep the block, drop the dead url: a text block saying
                // "image missing" is less useful than an image block the user
                // can repoint at a working asset.
                data[assetField.field] = "";
              }
            }
          }

          blocks.push({
            category: block.category,
            type: block.type,
            data,
          });
        }

        pages.push({
          title: page.title,
          completionRules: page.completionRules ?? null,
          blocks,
          sourceHref: page.href,
        });
      }
      lessons.push({ title: lesson.title, pages });
    }
    modules.push({ title: mod.title, lessons });
  }

  for (const skip of ctx.skips) {
    const code =
      skip.reason === "too_large" || skip.reason === "data_url_cap"
        ? "asset_too_large"
        : skip.reason === "unsupported_type"
          ? "asset_type_unsupported"
          : "asset_missing";
    addNote(loss, { code, location: skip.zipPath, detail: skip.detail });
  }

  const ingestedAssets = Array.from(ctx.cache.values());
  const assetStats = {
    ingested: ingestedAssets.length,
    degraded: ingestedAssets.filter((a) => a.degraded).length,
    failed: ctx.skips.length,
  };

  const course: ImportedCourseDraft = {
    title: sidecar.course.title,
    overview: sidecar.course.overview ?? null,
    audience: sidecar.course.audience ?? null,
    tone: sidecar.course.tone ?? null,
    complianceLevel: sidecar.course.complianceLevel ?? null,
    targetWordCount: sidecar.course.targetWordCount ?? null,
    brandConfig: sidecar.course.brandConfig ?? null,
    ilos: sidecar.course.ilos ?? null,
    assessmentPlan: sidecar.course.assessmentPlan ?? null,
    interactionConfig: sidecar.course.interactionConfig ?? null,
    scormMetadata: sidecar.course.scormMetadata ?? null,
    modules,
  };

  loss.fidelity = resolveFidelity(loss, true);
  return { course, loss, assetStats };
}
