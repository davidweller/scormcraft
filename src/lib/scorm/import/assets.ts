/**
 * Ingest an asset out of an uploaded SCORM package.
 *
 * Mirrors prepareDocxForImport's behaviour: upload to Vercel Blob and create a
 * Media row when Blob is configured, otherwise degrade to an inline `data:` URL
 * so the content still appears. The `data:` path is a local-development
 * fallback, not a supported production mode — see the size cap below.
 */

import { prisma } from "@/lib/db";
import { isBlobConfigured, uploadBlob } from "@/lib/blob";
import { getDocumentTypeByFilename } from "@/lib/document-files";
import type { ScormPackage } from "./unzip";

export type AssetKind = "image" | "video" | "file" | "logo";

export interface IngestedAsset {
  /** Blob https URL, or a `data:` URL when Blob is unconfigured. */
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  mediaId?: string;
  /** True when this is a `data:` URL rather than a stored asset. */
  degraded: boolean;
}

export type AssetSkipReason =
  | "not_found"
  | "too_large"
  | "unsupported_type"
  | "empty"
  | "data_url_cap"
  | "blob_unconfigured";

export interface AssetSkip {
  zipPath: string;
  reason: AssetSkipReason;
  detail: string;
}

export interface AssetLimits {
  image: number;
  video: number;
  file: number;
  logo: number;
  /**
   * Cap on an inline `data:` URL. A multi-megabyte base64 string lives inside
   * a JSONB column that the editor loads in full on every page view, so past
   * this size the asset is dropped rather than stored.
   */
  dataUrlMax: number;
}

export const DEFAULT_ASSET_LIMITS: AssetLimits = {
  image: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  file: 25 * 1024 * 1024,
  logo: 5 * 1024 * 1024,
  dataUrlMax: 512 * 1024,
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
};

function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Identify a file by its leading bytes.
 *
 * Returns null when the bytes are not a format we recognise, which is not by
 * itself a rejection — plenty of legitimate downloads (CSV, plain text) have no
 * magic number.
 */
export function sniffMimeType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  const hex = buf.subarray(0, 12).toString("hex");
  const ascii = buf.subarray(0, 12).toString("latin1");

  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
  if (ascii.startsWith("RIFF") && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (hex.startsWith("25504446")) return "application/pdf";
  if (hex.startsWith("504b0304")) return "application/zip"; // also docx/xlsx/pptx
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4";

  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "text/html";
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return "image/svg+xml";
  return null;
}

/**
 * True when the bytes are markup pretending to be a raster image.
 *
 * An <img src> pointing at HTML or at an SVG carrying script is a stored-XSS
 * vector, so an image whose bytes disagree with its extension is refused.
 */
function isMarkupMasqueradingAsImage(sniffed: string | null, declaredExt: string): boolean {
  if (!sniffed) return false;
  const declaredIsRaster = IMAGE_EXTENSIONS.has(declaredExt) && declaredExt !== "svg";
  return declaredIsRaster && (sniffed === "text/html" || sniffed === "image/svg+xml");
}

function isAllowedExtension(kind: AssetKind, ext: string): boolean {
  if (kind === "image" || kind === "logo") return IMAGE_EXTENSIONS.has(ext);
  if (kind === "video") return VIDEO_EXTENSIONS.has(ext);
  // A download of an unrecognised type is still imported, as
  // application/octet-stream; it just will not get a type label on render.
  return true;
}

export interface IngestContext {
  pkg: ScormPackage;
  /** Deduplicates by zip path: a package references its logo on every page. */
  cache: Map<string, IngestedAsset>;
  skips: AssetSkip[];
  limits?: Partial<AssetLimits>;
  /** Set false in a dry run to avoid writing Media rows. */
  persistMedia?: boolean;
}

export async function ingestAsset(
  ctx: IngestContext,
  zipPath: string,
  opts: { kind: AssetKind; alt?: string }
): Promise<IngestedAsset | null> {
  const limits: AssetLimits = { ...DEFAULT_ASSET_LIMITS, ...ctx.limits };
  const cached = ctx.cache.get(zipPath);
  if (cached) return cached;

  const skip = (reason: AssetSkipReason, detail: string): null => {
    ctx.skips.push({ zipPath, reason, detail });
    return null;
  };

  if (!ctx.pkg.has(zipPath)) return skip("not_found", `${zipPath} is not in the package`);

  const ext = extensionOf(zipPath);
  if (!isAllowedExtension(opts.kind, ext)) {
    return skip("unsupported_type", `${zipPath} is not a supported ${opts.kind} type`);
  }

  const declaredSize = ctx.pkg.sizeOf(zipPath);
  const cap = limits[opts.kind];
  if (declaredSize > cap) {
    return skip(
      "too_large",
      `${zipPath} is ${(declaredSize / 1024 / 1024).toFixed(1)}MB, over the ${(
        cap / 1024 / 1024
      ).toFixed(0)}MB limit for ${opts.kind}s`
    );
  }

  let buf: Buffer;
  try {
    buf = await ctx.pkg.read(zipPath);
  } catch (e) {
    return skip("not_found", `${zipPath} could not be read: ${e instanceof Error ? e.message : "error"}`);
  }
  if (buf.length === 0) return skip("empty", `${zipPath} is empty`);
  if (buf.length > cap) {
    return skip("too_large", `${zipPath} is over the ${opts.kind} size limit`);
  }

  const sniffed = sniffMimeType(buf);
  if (isMarkupMasqueradingAsImage(sniffed, ext)) {
    return skip(
      "unsupported_type",
      `${zipPath} claims to be an image but contains ${sniffed}`
    );
  }

  // Trust the bytes over the extension where they disagree and the sniff is
  // confident; fall back to the extension, then to the document table.
  const documentType = getDocumentTypeByFilename(zipPath);
  const mimeType =
    (sniffed && sniffed !== "application/zip" ? sniffed : null) ??
    EXT_TO_MIME[ext] ??
    documentType?.mimeType ??
    "application/octet-stream";

  const filename = zipPath.split("/").pop() || zipPath;

  if (!isBlobConfigured()) {
    if (buf.length > limits.dataUrlMax) {
      return skip(
        "data_url_cap",
        `${zipPath} is ${(buf.length / 1024).toFixed(
          0
        )}KB; without Blob storage configured, assets over ${(
          limits.dataUrlMax / 1024
        ).toFixed(0)}KB are not imported`
      );
    }
    const asset: IngestedAsset = {
      url: `data:${mimeType};base64,${buf.toString("base64")}`,
      filename,
      mimeType,
      size: buf.length,
      degraded: true,
    };
    ctx.cache.set(zipPath, asset);
    return asset;
  }

  try {
    const safeExt = ext || "bin";
    const key = `media/scorm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${safeExt}`;
    const { url } = await uploadBlob(key, buf, { contentType: mimeType });

    let mediaId: string | undefined;
    if (ctx.persistMedia !== false) {
      const media = await prisma.media.create({
        data: {
          url,
          filename,
          mimeType,
          size: buf.length,
          alt: opts.alt?.trim() || null,
          source: "upload",
        },
      });
      mediaId = media.id;
    }

    const asset: IngestedAsset = {
      url,
      filename,
      mimeType,
      size: buf.length,
      mediaId,
      degraded: false,
    };
    ctx.cache.set(zipPath, asset);
    return asset;
  } catch (e) {
    // Upload failed: fall back to a data URL, as the DOCX import path does.
    if (buf.length > limits.dataUrlMax) {
      return skip(
        "data_url_cap",
        `${zipPath} failed to upload (${
          e instanceof Error ? e.message : "error"
        }) and is too large to inline`
      );
    }
    const asset: IngestedAsset = {
      url: `data:${mimeType};base64,${buf.toString("base64")}`,
      filename,
      mimeType,
      size: buf.length,
      degraded: true,
    };
    ctx.cache.set(zipPath, asset);
    return asset;
  }
}
