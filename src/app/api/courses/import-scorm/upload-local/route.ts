/**
 * Local-storage counterpart of upload-url (desktop app): the browser PUTs the
 * raw package here and it is streamed to the same staging pathname that
 * /analyze looks up by token. No serverless body limit applies locally.
 */
import { NextResponse } from "next/server";
import { storageBackend, writeLocalStream } from "@/lib/blob";
import { DEFAULT_ZIP_LIMITS } from "@/lib/scorm/import/unzip";
import { STAGING_PREFIX, isValidImportToken } from "@/lib/scorm/import/staging";

export async function PUT(request: Request): Promise<NextResponse> {
  if (storageBackend() !== "local") {
    return NextResponse.json({ error: "Local storage is not configured." }, { status: 503 });
  }
  const token = new URL(request.url).searchParams.get("token");
  if (!isValidImportToken(token)) {
    return NextResponse.json({ error: "Invalid upload token." }, { status: 400 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "Empty upload." }, { status: 400 });
  }
  try {
    const { size } = await writeLocalStream(
      `${STAGING_PREFIX}/${token}/package.zip`,
      request.body,
      DEFAULT_ZIP_LIMITS.maxArchiveBytes
    );
    return NextResponse.json({ ok: true, size });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed." },
      { status: 400 }
    );
  }
}
