import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, posix, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";

/**
 * File storage: files under STORAGE_DIR (set by electron/env.js), served by
 * src/app/files/[...path]. Urls are relative: `/files/<pathname>`. Without
 * STORAGE_DIR, uploads fail with a clear error.
 *
 * Server code that needs a stored file's bytes must use `fetchStored`, not
 * `fetch`: a relative `/files/...` url can't be fetched from the server.
 */

const STORAGE_DIR = process.env.STORAGE_DIR?.trim() || "";
const BLOB_STORE: "local" | "none" = STORAGE_DIR ? "local" : "none";

const NOT_CONFIGURED = "File storage is not set up (STORAGE_DIR is missing).";

export const LOCAL_URL_PREFIX = "/files/";

export function storageBackend(): "local" | "none" {
  return BLOB_STORE;
}

export function isBlobConfigured(): boolean {
  return BLOB_STORE !== "none";
}

// ── Local backend helpers ──────────────────────────────────────────────────

function cleanPathname(pathname: string): string {
  const norm = posix.normalize(pathname.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!norm || norm === "." || norm.startsWith("..") || norm.includes("/../")) {
    throw new Error(`Invalid storage path: ${pathname}`);
  }
  return norm;
}

/** Absolute disk path for a pathname, refusing anything outside STORAGE_DIR. */
export function localDiskPath(pathname: string): string {
  const root = resolve(STORAGE_DIR);
  const full = resolve(root, cleanPathname(pathname));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`Invalid storage path: ${pathname}`);
  }
  return full;
}

function localUrl(pathname: string): string {
  return LOCAL_URL_PREFIX + pathname.split("/").map(encodeURIComponent).join("/");
}

/** Pathname for a `/files/...` url, or null if the url isn't a local one. */
export function localPathnameFromUrl(url: string): string | null {
  if (!url.startsWith(LOCAL_URL_PREFIX)) return null;
  try {
    return cleanPathname(
      url
        .slice(LOCAL_URL_PREFIX.length)
        .split("?")[0]
        .split("/")
        .map(decodeURIComponent)
        .join("/")
    );
  } catch {
    return null;
  }
}

async function toBuffer(body: Blob | Buffer | ReadableStream): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  return Buffer.from(await new Response(body).arrayBuffer());
}

/** Keeps the exact pathname when free (callers rely on that), else adds a random suffix. */
function freePathname(pathname: string): string {
  if (!existsSync(localDiskPath(pathname))) return pathname;
  const ext = extname(pathname);
  const base = pathname.slice(0, pathname.length - ext.length);
  return `${base}-${randomBytes(6).toString("hex")}${ext}`;
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function contentTypeForPath(pathname: string): string {
  return CONTENT_TYPES[extname(pathname).toLowerCase()] ?? "application/octet-stream";
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function uploadBlob(
  pathname: string,
  body: Blob | Buffer | ReadableStream,
  options?: { contentType?: string }
): Promise<{ url: string }> {
  if (BLOB_STORE !== "local") throw new Error(NOT_CONFIGURED);
  const finalPath = freePathname(cleanPathname(pathname));
  const disk = localDiskPath(finalPath);
  await mkdir(dirname(disk), { recursive: true });
  await writeFile(disk, await toBuffer(body));
  return { url: localUrl(finalPath) };
}

/** Write a stream straight to local storage at an exact pathname (large uploads). */
export async function writeLocalStream(
  pathname: string,
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<{ url: string; size: number }> {
  if (BLOB_STORE !== "local") throw new Error(NOT_CONFIGURED);
  const clean = cleanPathname(pathname);
  const disk = localDiskPath(clean);
  await mkdir(dirname(disk), { recursive: true });
  const { createWriteStream } = await import("node:fs");
  const out = createWriteStream(disk);
  let size = 0;
  try {
    for await (const chunk of Readable.fromWeb(body as import("node:stream/web").ReadableStream)) {
      size += (chunk as Buffer).length;
      if (size > maxBytes) throw new Error(`Upload is larger than ${maxBytes} bytes.`);
      if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
  } catch (e) {
    out.destroy();
    await rm(disk, { force: true });
    throw e;
  }
  return { url: localUrl(clean), size };
}

export async function deleteBlob(url: string): Promise<void> {
  if (BLOB_STORE !== "local") return;
  const pathname = localPathnameFromUrl(url);
  if (pathname) await rm(localDiskPath(pathname), { force: true });
}

/** Find a stored file by its exact pathname. */
export async function findBlobByPathname(
  pathname: string
): Promise<{ url: string; size: number; uploadedAt: Date } | null> {
  if (BLOB_STORE !== "local") return null;
  try {
    const s = await stat(localDiskPath(pathname));
    return s.isFile() ? { url: localUrl(cleanPathname(pathname)), size: s.size, uploadedAt: s.mtime } : null;
  } catch {
    return null;
  }
}

/** Every blob under a prefix, for cleanup of an abandoned import. */
export async function listBlobs(
  prefix: string
): Promise<{ url: string; pathname: string; uploadedAt: Date }[]> {
  if (BLOB_STORE !== "local") return [];
  const root = resolve(STORAGE_DIR);
  const start = localDiskPath(prefix.replace(/\/+$/, "") || ".");
  if (!existsSync(start)) return [];
  const entries = await readdir(start, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const full = join(e.parentPath, e.name);
      const pathname = relative(root, full).split(sep).join("/");
      return { url: localUrl(pathname), pathname, uploadedAt: statSync(full).mtime };
    });
}

/**
 * `fetch` for stored files: reads `/files/...` urls from local storage and
 * fetches everything else. Always resolves to a Response (404 for a missing
 * local file or an unfetchable relative url), so call sites keep `res.ok`.
 */
export async function fetchStored(url: string, init?: RequestInit): Promise<Response> {
  const pathname = localPathnameFromUrl(url);
  if (pathname !== null) {
    if (BLOB_STORE !== "local") return new Response(null, { status: 404 });
    try {
      const disk = localDiskPath(pathname);
      const buf = await readFile(disk);
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: { "content-type": contentTypeForPath(pathname), "content-length": String(buf.length) },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
  if (!/^https?:\/\//i.test(url)) return new Response(null, { status: 404 });
  return fetch(url, init);
}

/** Stream a local file for the /files route. */
export function openLocalFile(
  pathname: string
): { stream: ReadableStream; size: number; contentType: string } | null {
  if (BLOB_STORE !== "local") return null;
  let disk: string;
  try {
    disk = localDiskPath(pathname);
  } catch {
    return null;
  }
  if (!existsSync(disk)) return null;
  const s = statSync(disk);
  if (!s.isFile()) return null;
  return {
    stream: Readable.toWeb(createReadStream(disk)) as ReadableStream,
    size: s.size,
    contentType: contentTypeForPath(pathname),
  };
}
