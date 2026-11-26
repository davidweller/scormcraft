import { NextResponse } from "next/server";
import { restoreSnapshot } from "@/lib/snapshots";

/** Puts the course back to a saved version. The current state is saved first. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ courseId: string; snapshotId: string }> }
) {
  const { courseId, snapshotId } = await params;
  try {
    const ok = await restoreSnapshot(courseId, snapshotId);
    if (!ok) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to restore this version" }, { status: 500 });
  }
}
