/**
 * Write a staged SCORM import into the database.
 *
 * The draft is re-read from staging on the server. The request body carries
 * only the import token and an optional title override — it never carries the
 * course tree, so a caller cannot have arbitrary content written as though it
 * had been parsed and bounded by /analyze.
 */

import { NextResponse } from "next/server";
import { persistScormImport } from "@/lib/scorm/import/persist";
import {
  discardStagedImport,
  isValidImportToken,
  readStagedImport,
} from "@/lib/scorm/import/staging";

// Must match the value for this path in vercel.json, which wins on Vercel.
export const maxDuration = 300;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      importToken?: unknown;
      title?: unknown;
    };

    if (!isValidImportToken(body.importToken)) {
      return NextResponse.json({ error: "A valid importToken is required." }, { status: 400 });
    }

    const staged = await readStagedImport(body.importToken);
    if (!staged) {
      return NextResponse.json(
        {
          error:
            "That import has expired or was already committed. Upload the package again.",
        },
        { status: 410 }
      );
    }

    const course = await persistScormImport(staged.course, {
      title: typeof body.title === "string" ? body.title : undefined,
    });

    // Discarding also deletes the uploaded package. A cleanup failure must not
    // fail a successful commit, so this is deliberately not awaited for errors.
    await discardStagedImport(body.importToken).catch(() => undefined);

    return NextResponse.json({ course });
  } catch (e) {
    console.error("SCORM import commit failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create the course." },
      { status: 500 }
    );
  }
}
