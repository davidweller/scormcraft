import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { uploadBlob, deleteBlob, isBlobConfigured } from "@/lib/blob";
import { DOCUMENT_EXTENSIONS_LABEL, DOCUMENT_MAX_SIZE, resolveUploadedDocument } from "@/lib/document-files";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const source = searchParams.get("source");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { filename: { contains: search, mode: "insensitive" } },
        { alt: { contains: search, mode: "insensitive" } },
        { prompt: { contains: search, mode: "insensitive" } },
      ];
    }
    if (source && (source === "upload" || source === "ai_generated")) {
      where.source = source;
    }

    const [media, total] = await Promise.all([
      prisma.media.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.media.count({ where }),
    ]);

    return NextResponse.json({
      media,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("Failed to fetch media:", e);
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "Upload not configured. Set BLOB_READ_WRITE_TOKEN." },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const alt = (formData.get("alt") as string) || "";

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const fileName = file.name || "";
    const lowerName = fileName.toLowerCase();
    const isImage = file.type.startsWith("image/");
    const hasMp4Mime = file.type === "video/mp4";
    const hasMp4Ext = lowerName.endsWith(".mp4");
    const isMp4 = hasMp4Mime && hasMp4Ext;
    const documentType = !isImage && !isMp4 ? resolveUploadedDocument(fileName, file.type) : null;
    if (!isImage && !isMp4 && !documentType) {
      return NextResponse.json(
        { error: `Only images, MP4 videos, and ${DOCUMENT_EXTENSIONS_LABEL} documents are allowed` },
        { status: 400 }
      );
    }
    if (hasMp4Mime !== hasMp4Ext) {
      return NextResponse.json(
        { error: "MP4 uploads must use video/mp4 MIME type and a .mp4 extension" },
        { status: 400 }
      );
    }
    // Store the canonical MIME, since browsers often report documents as octet-stream
    const mimeType = documentType ? documentType.mimeType : file.type;

    const maxSize = isMp4 ? 100 * 1024 * 1024 : documentType ? DOCUMENT_MAX_SIZE : 4.5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${isMp4 ? "100MB" : "4.5MB"}, got ${(
            file.size /
            1024 /
            1024
          ).toFixed(2)}MB`,
        },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "png";
    const pathname = `media/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

    console.log(`Uploading file: ${file.name}, size: ${file.size}, type: ${file.type}`);
    
    const { url } = await uploadBlob(pathname, file, {
      contentType: mimeType,
    });

    console.log(`Upload successful: ${url}`);

    const media = await prisma.media.create({
      data: {
        url,
        filename: file.name,
        mimeType,
        size: file.size,
        alt: alt || null,
        source: "upload",
      },
    });

    return NextResponse.json({ media });
  } catch (e) {
    console.error("Failed to upload media:", e);
    const errorMessage = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const media = await prisma.media.findUnique({ where: { id } });
    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    await deleteBlob(media.url);
    await prisma.media.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Failed to delete media:", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
