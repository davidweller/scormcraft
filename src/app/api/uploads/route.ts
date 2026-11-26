import { NextResponse } from "next/server";
import { uploadBlob, isBlobConfigured } from "@/lib/blob";

export async function POST(request: Request) {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "File storage is not set up, so uploads are unavailable." },
      { status: 503 }
    );
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const prefix = (formData.get("prefix") as string) || "uploads";
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const ext = file.name.replace(/^.*\./, "") || "bin";
    const pathname = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const { url } = await uploadBlob(pathname, file, {
      contentType: file.type || undefined,
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
