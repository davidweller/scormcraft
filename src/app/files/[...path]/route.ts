/**
 * Serves files from local storage (desktop app). Urls look like
 * /files/<pathname>; see src/lib/blob.ts. 404 on the web app, where
 * storage is Vercel Blob and urls are absolute.
 */
import { openLocalFile } from "@/lib/blob";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const file = openLocalFile(params.path.map((p) => decodeURIComponent(p)).join("/"));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, {
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.size),
      "cache-control": "private, max-age=3600",
    },
  });
}
