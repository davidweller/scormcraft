import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { countSnapshot, takeSnapshot, type SnapshotData } from "@/lib/snapshots";

/** Lists a course's saved versions, newest first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  try {
    const snapshots = await prisma.courseSnapshot.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      snapshots.map((s) => ({
        id: s.id,
        reason: s.reason,
        createdAt: s.createdAt,
        counts: countSnapshot(s.data as unknown as SnapshotData),
      }))
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to load the history" }, { status: 500 });
  }
}

/** Saves a version now, at the author's request. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const { reason } = (await request.json().catch(() => ({}))) as { reason?: string };
  const label = typeof reason === "string" && reason.trim() ? reason.trim() : "Saved by you";
  const id = await takeSnapshot(courseId, label);
  if (!id) {
    return NextResponse.json(
      { error: "Nothing to save yet. Add a module first." },
      { status: 400 }
    );
  }
  return NextResponse.json({ id });
}
