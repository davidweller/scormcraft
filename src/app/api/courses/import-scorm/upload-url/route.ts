/**
 * Issue a Vercel Blob client-upload token for a SCORM package.
 *
 * The browser uploads straight to Blob, so the package never passes through a
 * serverless function body and Vercel's 4.5MB request limit does not apply.
 * Real SCORM packages are routinely 10-100MB+.
 */

import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isBlobConfigured } from "@/lib/blob";
import { DEFAULT_ZIP_LIMITS } from "@/lib/scorm/import/unzip";
import { STAGING_PREFIX, isValidImportToken } from "@/lib/scorm/import/staging";

const ALLOWED_CONTENT_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

export async function POST(request: Request): Promise<NextResponse> {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      {
        error:
          "Blob storage is not configured, so large packages cannot be uploaded. Set BLOB_READ_WRITE_TOKEN, or use the small-package upload path.",
      },
      { status: 503 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // The client proposes the pathname, so it is checked rather than
        // trusted: it must be the package slot for a well-formed token.
        const match = pathname.match(
          new RegExp(`^${STAGING_PREFIX}/([0-9a-f]{40})/package\\.zip$`)
        );
        if (!match || !isValidImportToken(match[1])) {
          throw new Error("Invalid upload path.");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: DEFAULT_ZIP_LIMITS.maxArchiveBytes,
          // No random suffix: the pathname must stay exactly derivable from the
          // import token so /analyze can find the package itself rather than
          // being handed a url by the client. The token is already 160 bits of
          // randomness, so a suffix would add nothing.
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async () => {
        // Nothing to do: the client hands the resulting url to /analyze, and
        // this callback does not fire on localhost anyway.
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not prepare the upload." },
      { status: 400 }
    );
  }
}
