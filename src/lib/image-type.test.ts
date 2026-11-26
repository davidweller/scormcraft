import { describe, expect, it } from "vitest";
import { detectImageType } from "./image-type";

describe("detectImageType", () => {
  it("reads the type from the file's first bytes", () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).ext).toBe("png");
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).mimeType).toBe("image/jpeg");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageType(webp, "logo.png")).toEqual({ ext: "webp", mimeType: "image/webp" });
    expect(detectImageType(new TextEncoder().encode('<?xml version="1.0"?><svg></svg>')).ext).toBe("svg");
  });

  it("falls back to the name, then to png", () => {
    expect(detectImageType(new Uint8Array([1, 2, 3]), "https://x/y/logo.JPEG?v=2").ext).toBe("jpg");
    expect(detectImageType(new Uint8Array([1, 2, 3]), "logo").ext).toBe("png");
  });
});
