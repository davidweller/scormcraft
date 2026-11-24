/**
 * Gemini API client for AI image generation using Nano Banana 2 (Gemini 3.1 Flash Image).
 * Key order: per-course BYO key, then the app Settings key, then GEMINI_API_KEY.
 */

import { GoogleGenAI } from "@google/genai";
import { resolveApiKey } from "@/lib/settings";

export function getGeminiClient(apiKey?: string | null): GoogleGenAI | null {
  const key = resolveApiKey("gemini", apiKey);
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

export function isGeminiConfigured(apiKey?: string | null): boolean {
  return Boolean(resolveApiKey("gemini", apiKey));
}

export interface ImageGenerationOptions {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  style?: "photorealistic" | "illustration" | "flat" | "3d";
}

export interface GeneratedImage {
  base64Data: string;
  mimeType: string;
}

export async function generateImage(
  client: GoogleGenAI,
  options: ImageGenerationOptions
): Promise<GeneratedImage> {
  const { prompt, aspectRatio = "1:1", style } = options;

  const stylePrefix = style
    ? {
        photorealistic: "A photorealistic image of",
        illustration: "An illustrated image of",
        flat: "A flat design illustration of",
        "3d": "A 3D rendered image of",
      }[style]
    : "";

  const fullPrompt = stylePrefix ? `${stylePrefix} ${prompt}` : prompt;

  const aspectRatioPrompt = aspectRatio !== "1:1" ? ` The image should be ${aspectRatio} aspect ratio.` : "";

  const response = await client.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: fullPrompt + aspectRatioPrompt,
    config: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("No image generated");
  }

  const imagePart = parts.find((part) => part.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart?.inlineData) {
    throw new Error("No image data in response");
  }

  return {
    base64Data: imagePart.inlineData.data as string,
    mimeType: imagePart.inlineData.mimeType as string,
  };
}
