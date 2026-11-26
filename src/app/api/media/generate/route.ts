import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { uploadBlob, isBlobConfigured } from "@/lib/blob";
import { getGeminiClient, generateImage, type ImageGenerationOptions } from "@/lib/gemini";

export async function POST(request: Request) {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "File storage is not set up, so uploads are unavailable." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { prompt, aspectRatio, style, apiKey } = body as {
      prompt?: string;
      aspectRatio?: ImageGenerationOptions["aspectRatio"];
      style?: ImageGenerationOptions["style"];
      apiKey?: string;
    };

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const client = getGeminiClient(apiKey);
    if (!client) {
      return NextResponse.json(
        { error: "Gemini API not configured. Set GEMINI_API_KEY or provide an API key." },
        { status: 503 }
      );
    }

    const generated = await generateImage(client, {
      prompt: prompt.trim(),
      aspectRatio,
      style,
    });

    const buffer = Buffer.from(generated.base64Data, "base64");
    const ext = generated.mimeType.split("/")[1] || "png";
    const filename = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const pathname = `media/${filename}`;

    const { url } = await uploadBlob(pathname, buffer, {
      contentType: generated.mimeType,
    });

    const media = await prisma.media.create({
      data: {
        url,
        filename,
        mimeType: generated.mimeType,
        size: buffer.length,
        source: "ai_generated",
        prompt: prompt.trim(),
      },
    });

    return NextResponse.json({ media });
  } catch (e) {
    console.error("Failed to generate image:", e);
    const message = e instanceof Error ? e.message : "Image generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
