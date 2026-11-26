/**
 * Works out what kind of image a file is from its first bytes, falling back
 * to the name. Used so an exported logo keeps its real extension and type.
 */
export interface ImageType {
  ext: "png" | "jpg" | "gif" | "webp" | "svg";
  mimeType: string;
}

const BY_EXT: Record<string, ImageType> = {
  png: { ext: "png", mimeType: "image/png" },
  jpg: { ext: "jpg", mimeType: "image/jpeg" },
  jpeg: { ext: "jpg", mimeType: "image/jpeg" },
  gif: { ext: "gif", mimeType: "image/gif" },
  webp: { ext: "webp", mimeType: "image/webp" },
  svg: { ext: "svg", mimeType: "image/svg+xml" },
};

export function detectImageType(bytes: Uint8Array, name = ""): ImageType {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return BY_EXT.png;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return BY_EXT.jpg;
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return BY_EXT.gif;
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return BY_EXT.webp;
  }
  const head = Buffer.from(b.slice(0, 512)).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return BY_EXT.svg;

  const ext = name.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? BY_EXT.png;
}
