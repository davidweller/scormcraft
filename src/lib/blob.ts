import { put, del, list } from "@vercel/blob";

const BLOB_STORE = process.env.BLOB_READ_WRITE_TOKEN ? "vercel" : "none";

export async function uploadBlob(
  pathname: string,
  body: Blob | Buffer | ReadableStream,
  options?: { contentType?: string }
): Promise<{ url: string }> {
  if (BLOB_STORE !== "vercel") {
    throw new Error("Blob storage not configured. Set BLOB_READ_WRITE_TOKEN.");
  }
  const blob = await put(pathname, body, {
    access: "public",
    contentType: options?.contentType,
  });
  return { url: blob.url };
}

export async function deleteBlob(url: string): Promise<void> {
  if (BLOB_STORE !== "vercel") return;
  await del(url);
}

export function isBlobConfigured(): boolean {
  return BLOB_STORE === "vercel";
}

/**
 * Find a stored blob by its exact pathname.
 *
 * `put` adds a random suffix to the pathname, so a url cannot be reconstructed
 * from the path it was written under. Listing the prefix is the only way to
 * recover it in a later invocation.
 */
export async function findBlobByPathname(
  pathname: string
): Promise<{ url: string; size: number; uploadedAt: Date } | null> {
  if (BLOB_STORE !== "vercel") return null;
  const prefix = pathname.replace(/\/[^/]*$/, "/");
  const { blobs } = await list({ prefix, limit: 1000 });
  const match = blobs.find((b) => b.pathname === pathname);
  return match ? { url: match.url, size: match.size, uploadedAt: match.uploadedAt } : null;
}

/** Every blob under a prefix, for cleanup of an abandoned import. */
export async function listBlobs(
  prefix: string
): Promise<{ url: string; pathname: string; uploadedAt: Date }[]> {
  if (BLOB_STORE !== "vercel") return [];
  const { blobs } = await list({ prefix, limit: 1000 });
  return blobs.map((b) => ({ url: b.url, pathname: b.pathname, uploadedAt: b.uploadedAt }));
}
