/**
 * Serves files from local storage. Urls look like /files/<pathname>; see
 * src/lib/blob.ts.
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
