/**
 * Staging for a two-phase SCORM import.
 *
 * `analyze` parses the package and stages the resulting draft; `commit` reads
 * that draft back on the server and writes it. The commit step must never
 * accept the tree from the client — otherwise anyone could post an arbitrary
 * course body and have it written as though it had been parsed and bounded.
 * (The DOCX import route does accept client-supplied `importData`; this one
 * deliberately does not.)
 *
 * Two backends:
 *   - Vercel Blob, when configured. Survives across serverless invocations.
 *   - An in-process map, otherwise. Works for local development only, and is
 *     lost on restart. Stated plainly rather than papered over.
 */

import { deleteBlob, findBlobByPathname, isBlobConfigured, uploadBlob } from "@/lib/blob";
import type { ImportedCourseDraft, LossReport, ScormImportCounts } from "./types";

export const STAGING_PREFIX = "imports/scorm";
/** Abandoned staging entries are garbage after this long. */
export const STAGING_TTL_MS = 24 * 60 * 60 * 1000;

export interface StagedImport {
  importToken: string;
  stagedAt: string;
  packageFilename: string;
  packageBytes: number;
  /** Blob url of the uploaded package, when it came in that way. */
  packageUrl?: string;
  course: ImportedCourseDraft;
  loss: LossReport;
  counts: ScormImportCounts;
  warnings: string[];
}

interface MemoryEntry {
  value: StagedImport;
  expiresAt: number;
  blobUrl?: string;
}

/**
 * In-process fallback store.
 *
 * Module scope, so it is per-instance. On Vercel that means a staged import may
 * land on one lambda and the commit on another, which is exactly why Blob is
 * the real backend and this one is for local development.
 */
const memoryStore = new Map<string, MemoryEntry>();

function pruneMemory(now = Date.now()): void {
  for (const [token, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(token);
  }
}

export function stagingPath(importToken: string): string {
  return `${STAGING_PREFIX}/${importToken}/staged.json`;
}

/**
 * Where the client uploads the package itself.
 *
 * Deterministic from the token, so the analyze route can look the package up
 * rather than accept a url from the client — which would be an SSRF surface.
 */
export function packagePath(importToken: string): string {
  return `${STAGING_PREFIX}/${importToken}/package.zip`;
}

export function newImportToken(): string {
  // Unguessable: the staged draft sits behind a public Blob url, so the token
  // is the only thing protecting it. 160 bits of randomness.
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A token must look like one before it is interpolated into a Blob path. */
export function isValidImportToken(token: unknown): token is string {
  return typeof token === "string" && /^[0-9a-f]{40}$/.test(token);
}

export async function stageImport(staged: StagedImport): Promise<void> {
  const expiresAt = Date.now() + STAGING_TTL_MS;

  if (!isBlobConfigured()) {
    pruneMemory();
    memoryStore.set(staged.importToken, { value: staged, expiresAt });
    return;
  }

  const { url } = await uploadBlob(
    stagingPath(staged.importToken),
    Buffer.from(JSON.stringify(staged), "utf8"),
    { contentType: "application/json" }
  );
  // Cached so a same-instance commit skips the list-and-fetch round trip.
  memoryStore.set(staged.importToken, { value: staged, expiresAt, blobUrl: url });
}

export async function readStagedImport(importToken: string): Promise<StagedImport | null> {
  if (!isValidImportToken(importToken)) return null;

  pruneMemory();
  const cached = memoryStore.get(importToken);
  if (cached) return cached.value;

  if (!isBlobConfigured()) return null;

  // Not in this instance's memory, which is the normal case on Vercel: the
  // analyze and commit calls land on different lambdas. The pathname is built
  // from a validated token, never from client-supplied text.
  try {
    const blob = await findBlobByPathname(stagingPath(importToken));
    if (!blob) return null;
    const res = await fetch(blob.url, {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = (await res.json()) as StagedImport;
    // Guards against a path collision handing back somebody else's draft.
    return parsed.importToken === importToken ? parsed : null;
  } catch {
    return null;
  }
}

/** Called on a successful commit: the package and the draft are both garbage. */
export async function discardStagedImport(importToken: string): Promise<void> {
  if (!isValidImportToken(importToken)) return;
  const entry = memoryStore.get(importToken);
  memoryStore.delete(importToken);

  if (!isBlobConfigured()) return;
  const stagedUrl = entry?.blobUrl ?? (await findBlobByPathname(stagingPath(importToken)))?.url;
  const targets = [stagedUrl, entry?.value.packageUrl].filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
  await Promise.all(
    // A failed cleanup must not fail the commit; the GC script picks up the rest.
    targets.map((url) => deleteBlob(url).catch(() => undefined))
  );
}
