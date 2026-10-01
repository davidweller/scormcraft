import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Serves an uploaded media file as an attachment under its original filename.
 * Used by preview, where links to Blob storage are cross-origin and the `download` attribute is ignored.
 * Only URLs recorded in the Media table are served, so this can't be used as an open proxy.
 */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const media = await prisma.media.findFirst({ where: { url } });
  if (!media) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const res = await fetch(media.url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok || !res.body) {
    return NextResponse.json({ error: "Could not fetch file" }, { status: 502 });
  }

  // ASCII fallback plus RFC 5987 form so non-ASCII names survive
  const asciiName = media.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const disposition = `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(media.filename)}`;

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": media.mimeType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
