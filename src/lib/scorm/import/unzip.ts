/**
 * Safe read-only access to an uploaded SCORM package.
 *
 * Everything hostile about a zip is handled here: path traversal, declared-size
 * lies, compression bombs, entry-count floods, and the mundane but far more
 * common problems — a package zipped one folder too deep, backslash separators
 * from a Windows authoring tool, and case-mismatched asset references.
 *
 * Nothing is ever written to the filesystem. Entries are decompressed into
 * memory on demand and only when something actually asks for them.
 *
 * Note that JSZip's reader already resolves "../" in an entry name before this
 * module sees it, so normaliseEntryPath is defence in depth for that one case.
 * It is not redundant: JSZip does not handle backslash separators, drive
 * letters, UNC prefixes, percent-encoding, NUL bytes or path length, and the
 * escapes_root check below is this module's alone.
 */

import JSZip from "jszip";

export interface ZipLimits {
  /** Maximum number of entries in the archive. */
  maxEntries: number;
  /** Maximum decompressed size of any single entry. */
  maxEntryBytes: number;
  /** Maximum total decompressed size of the archive. */
  maxTotalBytes: number;
  /** Maximum decompressed:compressed ratio for any single entry. */
  maxCompressionRatio: number;
  /** Maximum normalised path length. */
  maxPathLength: number;
  /** Maximum size of the uploaded archive itself. */
  maxArchiveBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 5000,
  maxEntryBytes: 25 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxPathLength: 512,
  maxArchiveBytes: 200 * 1024 * 1024,
};

export type RejectedEntryReason =
  | "absolute_path"
  | "drive_letter"
  | "unc_path"
  | "traversal"
  | "escapes_root"
  | "null_byte"
  | "path_too_long"
  | "case_collision";

export interface RejectedEntry {
  name: string;
  reason: RejectedEntryReason;
}

export class ScormPackageError extends Error {
  constructor(
    message: string,
    readonly code:
      | "archive_too_large"
      | "no_manifest"
      | "ambiguous_manifest"
      | "too_many_entries"
      | "entry_too_large"
      | "total_too_large"
      | "compression_ratio"
      | "size_mismatch"
      | "corrupt_archive"
  ) {
    super(message);
    this.name = "ScormPackageError";
  }
}

export interface ScormPackage {
  /** Directory containing imsmanifest.xml, "" at the archive root. */
  readonly root: string;
  /** Normalised, root-relative paths of every usable entry. */
  list(): string[];
  has(path: string): boolean;
  read(path: string): Promise<Buffer>;
  readText(path: string): Promise<string>;
  /** Declared decompressed size, or -1 when the entry is unknown. */
  sizeOf(path: string): number;
  /**
   * Resolve an href found inside `fromPath` against the package.
   * Returns null for an external URL, a path that escapes the root, or a path
   * with no matching entry.
   */
  resolve(fromPath: string, href: string): string | null;
  /** Decompressed bytes handed out so far. */
  bytesRead(): number;
  /** Entries dropped during normalisation, for the import's loss report. */
  rejectedEntries(): RejectedEntry[];
}

const MANIFEST_BASENAME = "imsmanifest.xml";

/** Decode %xx sequences, tolerating a malformed or double-encoded name. */
function tryDecode(path: string): string {
  if (!path.includes("%")) return path;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export interface NormaliseResult {
  path: string | null;
  reason?: RejectedEntryReason;
}

/**
 * Normalise a zip entry name to a safe relative path, or reject it.
 *
 * Exported for testing: the traversal rules here are the whole of the zip-slip
 * defence, so they are worth asserting directly.
 */
export function normaliseEntryPath(raw: string, maxPathLength: number): NormaliseResult {
  if (raw.includes("\0")) return { path: null, reason: "null_byte" };

  let path = tryDecode(raw).replace(/\\/g, "/").normalize("NFC");

  if (/^[a-zA-Z]:/.test(path)) return { path: null, reason: "drive_letter" };
  if (path.startsWith("//")) return { path: null, reason: "unc_path" };
  if (path.startsWith("/")) return { path: null, reason: "absolute_path" };

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // A leading ".." has nothing to pop, so it would escape the archive.
      if (segments.length === 0) return { path: null, reason: "traversal" };
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  path = segments.join("/");
  if (!path) return { path: null, reason: "traversal" };
  if (path.length > maxPathLength) return { path: null, reason: "path_too_long" };
  return { path };
}

/** Entries that are archive noise rather than package content. */
function isJunkEntry(path: string): boolean {
  return (
    path.startsWith("__MACOSX/") ||
    path === ".DS_Store" ||
    path.endsWith("/.DS_Store") ||
    path.split("/").some((s) => s === "__MACOSX" || s === ".DS_Store") ||
    path.endsWith("Thumbs.db")
  );
}

function dirnameOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function joinPath(base: string, href: string): string {
  if (!base) return href;
  return `${base}/${href}`;
}

interface InternalEntry {
  /** Normalised path relative to the archive root (not the package root). */
  archivePath: string;
  /** The original JSZip entry name. */
  zipName: string;
  declaredSize: number;
  compressedSize: number;
}

/** The declared sizes JSZip exposes, which are not part of its public types. */
interface JSZipInternalData {
  uncompressedSize?: number;
  compressedSize?: number;
}

export async function openScormPackage(
  buf: Buffer,
  limitOverrides: Partial<ZipLimits> = {}
): Promise<ScormPackage> {
  const limits: ZipLimits = { ...DEFAULT_ZIP_LIMITS, ...limitOverrides };

  // Checked before loadAsync so a 2GB upload is refused without being parsed.
  if (buf.length > limits.maxArchiveBytes) {
    throw new ScormPackageError(
      `Package is ${(buf.length / 1024 / 1024).toFixed(1)}MB; the maximum is ${(
        limits.maxArchiveBytes / 1024 / 1024
      ).toFixed(0)}MB.`,
      "archive_too_large"
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (e) {
    throw new ScormPackageError(
      `Could not read the archive: ${e instanceof Error ? e.message : "unknown error"}`,
      "corrupt_archive"
    );
  }

  const rejected: RejectedEntry[] = [];
  const entries: InternalEntry[] = [];
  let entryCount = 0;
  let declaredTotal = 0;

  for (const zipName of Object.keys(zip.files)) {
    const file = zip.files[zipName];
    if (file.dir) continue;

    entryCount += 1;
    if (entryCount > limits.maxEntries) {
      throw new ScormPackageError(
        `Package contains more than ${limits.maxEntries} files.`,
        "too_many_entries"
      );
    }

    const { path, reason } = normaliseEntryPath(zipName, limits.maxPathLength);
    if (!path) {
      rejected.push({ name: zipName, reason: reason ?? "traversal" });
      continue;
    }
    if (isJunkEntry(path)) continue;

    // Declared sizes come from the central directory, so these checks run
    // before anything is decompressed. That is the point: a bomb must be
    // refused without being expanded.
    const internal = (file as unknown as { _data?: JSZipInternalData })._data ?? {};
    const declaredSize = Number(internal.uncompressedSize ?? 0);
    const compressedSize = Number(internal.compressedSize ?? 0);

    if (declaredSize > limits.maxEntryBytes) {
      throw new ScormPackageError(
        `Package entry "${path}" declares ${(declaredSize / 1024 / 1024).toFixed(
          1
        )}MB, over the ${(limits.maxEntryBytes / 1024 / 1024).toFixed(0)}MB per-file limit.`,
        "entry_too_large"
      );
    }
    if (
      compressedSize > 0 &&
      declaredSize / compressedSize > limits.maxCompressionRatio
    ) {
      throw new ScormPackageError(
        `Package entry "${path}" expands ${Math.round(
          declaredSize / compressedSize
        )}x, over the ${limits.maxCompressionRatio}x limit.`,
        "compression_ratio"
      );
    }

    declaredTotal += declaredSize;
    if (declaredTotal > limits.maxTotalBytes) {
      throw new ScormPackageError(
        `Package expands to more than ${(limits.maxTotalBytes / 1024 / 1024).toFixed(0)}MB.`,
        "total_too_large"
      );
    }

    entries.push({ archivePath: path, zipName, declaredSize, compressedSize });
  }

  // Root detection: the shallowest imsmanifest.xml wins. This is what handles
  // the very common "zipped the folder instead of its contents".
  const manifests = entries.filter(
    (e) => e.archivePath.toLowerCase().split("/").pop() === MANIFEST_BASENAME
  );
  if (manifests.length === 0) {
    throw new ScormPackageError(
      "No imsmanifest.xml found. This does not look like a SCORM package.",
      "no_manifest"
    );
  }
  const depthOf = (p: string) => p.split("/").length;
  const minDepth = Math.min(...manifests.map((m) => depthOf(m.archivePath)));
  const shallowest = manifests.filter((m) => depthOf(m.archivePath) === minDepth);
  if (shallowest.length > 1) {
    throw new ScormPackageError(
      `Package contains ${shallowest.length} manifests at the same level, so its root is ambiguous.`,
      "ambiguous_manifest"
    );
  }
  const root = dirnameOf(shallowest[0].archivePath);
  const rootPrefix = root ? `${root}/` : "";

  // Index only what is inside the package root, keyed case-insensitively:
  // Windows authoring tools emit images/Logo.PNG in the zip and reference
  // images/logo.png from the HTML.
  const byPath = new Map<string, InternalEntry>();
  const byLowerPath = new Map<string, string>();
  for (const entry of entries) {
    if (rootPrefix && !entry.archivePath.startsWith(rootPrefix)) {
      rejected.push({ name: entry.zipName, reason: "escapes_root" });
      continue;
    }
    const relative = entry.archivePath.slice(rootPrefix.length);
    if (!relative) continue;
    byPath.set(relative, entry);
    const lower = relative.toLowerCase();
    if (byLowerPath.has(lower)) {
      rejected.push({ name: entry.zipName, reason: "case_collision" });
      continue;
    }
    byLowerPath.set(lower, relative);
  }

  let bytesRead = 0;

  function lookup(path: string): InternalEntry | undefined {
    const direct = byPath.get(path);
    if (direct) return direct;
    const decoded = tryDecode(path);
    const viaDecoded = byPath.get(decoded);
    if (viaDecoded) return viaDecoded;
    const actual =
      byLowerPath.get(path.toLowerCase()) ?? byLowerPath.get(decoded.toLowerCase());
    return actual ? byPath.get(actual) : undefined;
  }

  async function read(path: string): Promise<Buffer> {
    const entry = lookup(path);
    if (!entry) throw new ScormPackageError(`Entry not found: ${path}`, "corrupt_archive");

    const file = zip.files[entry.zipName];
    const data = await file.async("nodebuffer");

    // The declared sizes may have lied. Abort on the real figures too.
    if (data.length > limits.maxEntryBytes) {
      throw new ScormPackageError(
        `Entry "${path}" decompressed to ${(data.length / 1024 / 1024).toFixed(
          1
        )}MB, over the per-file limit.`,
        "size_mismatch"
      );
    }
    bytesRead += data.length;
    if (bytesRead > limits.maxTotalBytes) {
      throw new ScormPackageError(
        "Package decompressed past the total size limit; its declared sizes were wrong.",
        "size_mismatch"
      );
    }
    return data;
  }

  return {
    root,
    list: () => Array.from(byPath.keys()),
    has: (path) => lookup(path) !== undefined,
    read,
    async readText(path) {
      const buffer = await read(path);
      let text = buffer.toString("utf8");
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
      return text;
    },
    sizeOf: (path) => lookup(path)?.declaredSize ?? -1,
    resolve(fromPath, href) {
      const trimmed = href.trim();
      if (!trimmed) return null;
      // An external URL is not ours to resolve, and must never be fetched.
      if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;

      const bare = trimmed.split("#")[0].split("?")[0];
      if (!bare) return null;

      const candidate = bare.startsWith("/")
        ? bare.slice(1)
        : joinPath(dirnameOf(fromPath), bare);
      const { path } = normaliseEntryPath(candidate, limits.maxPathLength);
      if (!path) return null;
      return lookup(path) ? (byPath.has(path) ? path : byLowerPath.get(path.toLowerCase()) ?? null) : null;
    },
    bytesRead: () => bytesRead,
    rejectedEntries: () => [...rejected],
  };
}
