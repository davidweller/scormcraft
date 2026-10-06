/**
 * Analyse an uploaded SCORM package and stage the result for commit.
 *
 * Nothing is written to the course tables here. Assets ARE ingested for real,
 * because the review step has to show which ones failed, and ingesting again at
 * commit time would upload everything twice.
 *
 * Two inputs:
 *   - JSON `{ importToken, filename }` after a direct-to-Blob client upload.
 *     The package url is derived from the token server-side; no client-supplied
 *     url is ever fetched, so there is no SSRF surface.
 *   - multipart/form-data with a `file`, capped well under Vercel's 4.5MB body
 *     limit. Local development and small packages only.
 */

import { NextResponse } from "next/server";
import { findBlobByPathname, isBlobConfigured } from "@/lib/blob";
import {
  ScormImportUnsupportedError,
  importScormPackage,
} from "@/lib/scorm/import";
import { ScormPackageError } from "@/lib/scorm/import/unzip";
import { buildPreview } from "@/lib/scorm/import/preview";
import {
  isValidImportToken,
  newImportToken,
  packagePath,
  stageImport,
} from "@/lib/scorm/import/staging";

// Must match the value for this path in vercel.json, which wins on Vercel.
export const maxDuration = 300;

/** Vercel's request body limit is 4.5MB; stay under it with room to spare. */
const MULTIPART_MAX_BYTES = 4 * 1024 * 1024;

interface PackageInput {
  bytes: Buffer;
  filename: string;
  importToken: string;
  packageUrl?: string;
}

async function readPackageFromBlob(body: unknown): Promise<PackageInput> {
  const { importToken, filename } = (body ?? {}) as {
    importToken?: unknown;
    filename?: unknown;
  };

  if (!isValidImportToken(importToken)) {
    throw new BadRequest("A valid importToken is required.");
  }
  if (!isBlobConfigured()) {
    throw new BadRequest("Blob storage is not configured.", 503);
  }

  const blob = await findBlobByPathname(packagePath(importToken));
  if (!blob) {
    throw new BadRequest("No uploaded package found for that import token.", 404);
  }

  const res = await fetch(blob.url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new BadRequest(`Could not read the uploaded package (HTTP ${res.status}).`, 502);
  }

  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    filename: typeof filename === "string" && filename ? filename : "package.zip",
    importToken,
    packageUrl: blob.url,
  };
}

async function readPackageFromMultipart(request: Request): Promise<PackageInput> {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new BadRequest("file is required.");

  if (!/\.zip$/i.test(file.name)) {
    throw new BadRequest("Please upload a .zip SCORM package.");
  }
  if (file.size > MULTIPART_MAX_BYTES) {
    throw new BadRequest(
      `This upload path is limited to ${(MULTIPART_MAX_BYTES / 1024 / 1024).toFixed(
        0
      )}MB. Configure Blob storage to import larger packages.`,
      413
    );
  }

  return {
    bytes: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    importToken: newImportToken(),
  };
}

class BadRequest extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const contentType = request.headers.get("content-type") || "";
    const input = contentType.includes("application/json")
      ? await readPackageFromBlob(await request.json().catch(() => ({})))
      : await readPackageFromMultipart(request);

    const analysis = await importScormPackage(input.bytes, { persistMedia: true });

    const staged = {
      importToken: input.importToken,
      stagedAt: new Date().toISOString(),
      packageFilename: input.filename,
      packageBytes: input.bytes.length,
      packageUrl: input.packageUrl,
      course: analysis.course,
      loss: analysis.loss,
      counts: analysis.counts,
      warnings: analysis.warnings,
    };
    await stageImport(staged);

    return NextResponse.json({ preview: buildPreview(staged, analysis.path) });
  } catch (e) {
    if (e instanceof BadRequest) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof ScormPackageError) {
      // Rejected on its contents: a bad archive, a bomb, or not a package.
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    if (e instanceof ScormImportUnsupportedError) {
      return NextResponse.json({ error: e.message, path: e.path }, { status: 422 });
    }
    console.error("SCORM import analyze failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not analyse the package." },
      { status: 500 }
    );
  }
}
