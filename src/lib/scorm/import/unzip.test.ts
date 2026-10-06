import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  DEFAULT_ZIP_LIMITS,
  ScormPackageError,
  normaliseEntryPath,
  openScormPackage,
} from "./unzip";

const MANIFEST = '<?xml version="1.0"?><manifest identifier="m1"></manifest>';

async function makeZip(
  files: Record<string, string | Buffer>,
  compress = false
): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  const out = await zip.generateAsync(
    // JSZip defaults to STORE, which makes every ratio exactly 1:1. A bomb
    // fixture has to ask for DEFLATE explicitly.
    compress
      ? { type: "nodebuffer", compression: "DEFLATE" }
      : { type: "nodebuffer" }
  );
  return Buffer.from(out);
}

/**
 * Rename an entry in the finished zip bytes. The name appears in the local
 * header and the central directory, and neither is covered by the entry's CRC,
 * so an equal-length substitution leaves every offset and checksum valid.
 *
 * Needed because JSZip's writer strips "../" from an entry name, so a traversal
 * fixture cannot be produced through its API.
 */
function renameEntryInPlace(zipBytes: Buffer, from: string, to: string): Buffer {
  if (Buffer.byteLength(from) !== Buffer.byteLength(to)) {
    throw new Error("replacement name must be the same byte length");
  }
  const out = Buffer.from(zipBytes);
  const needle = Buffer.from(from, "utf8");
  const replacement = Buffer.from(to, "utf8");
  let at = 0;
  for (;;) {
    const found = out.indexOf(needle, at);
    if (found === -1) break;
    replacement.copy(out, found);
    at = found + replacement.length;
  }
  return out;
}

describe("normaliseEntryPath", () => {
  const max = DEFAULT_ZIP_LIMITS.maxPathLength;

  it("converts backslashes and collapses redundant segments", () => {
    expect(normaliseEntryPath("content\\\\sub\\\\a.html", max).path).toBe("content/sub/a.html");
    expect(normaliseEntryPath("content//./a.html", max).path).toBe("content/a.html");
    expect(normaliseEntryPath("content/sub/../a.html", max).path).toBe("content/a.html");
  });

  it("decodes percent-encoded names", () => {
    expect(normaliseEntryPath("content/my%20page.html", max).path).toBe("content/my page.html");
  });

  it("rejects traversal, absolute, drive-letter and UNC paths", () => {
    expect(normaliseEntryPath("../../etc/passwd", max)).toEqual({ path: null, reason: "traversal" });
    expect(normaliseEntryPath("/etc/passwd", max)).toEqual({ path: null, reason: "absolute_path" });
    expect(normaliseEntryPath("C:/Windows/x", max)).toEqual({ path: null, reason: "drive_letter" });
    expect(normaliseEntryPath("//server/share/x", max)).toEqual({ path: null, reason: "unc_path" });
  });

  it("rejects a NUL byte and an over-long path", () => {
    expect(normaliseEntryPath("a\0b", max).reason).toBe("null_byte");
    expect(normaliseEntryPath("a/".repeat(400) + "b", max).reason).toBe("path_too_long");
  });

  it("rejects a path that climbs out after a legitimate segment", () => {
    expect(normaliseEntryPath("content/../../x", max).reason).toBe("traversal");
  });
});

describe("openScormPackage root detection", () => {
  it("finds a manifest at the archive root", async () => {
    const pkg = await openScormPackage(
      await makeZip({ "imsmanifest.xml": MANIFEST, "content/a.html": "<p>a</p>" })
    );
    expect(pkg.root).toBe("");
    expect(pkg.has("content/a.html")).toBe(true);
  });

  it("handles a package zipped one folder too deep", async () => {
    const pkg = await openScormPackage(
      await makeZip({ "MyCourse/imsmanifest.xml": MANIFEST, "MyCourse/content/a.html": "<p>a</p>" })
    );
    expect(pkg.root).toBe("MyCourse");
    // Paths handed out are relative to the package root, not the archive.
    expect(pkg.has("content/a.html")).toBe(true);
    expect(pkg.list()).toContain("imsmanifest.xml");
  });

  it("handles two levels of nesting", async () => {
    const pkg = await openScormPackage(
      await makeZip({ "a/b/imsmanifest.xml": MANIFEST, "a/b/c.html": "x" })
    );
    expect(pkg.root).toBe("a/b");
  });

  it("prefers the shallowest manifest", async () => {
    const pkg = await openScormPackage(
      await makeZip({
        "imsmanifest.xml": MANIFEST,
        "sub/imsmanifest.xml": MANIFEST,
        "sub/a.html": "x",
      })
    );
    expect(pkg.root).toBe("");
  });

  it("errors when there is no manifest", async () => {
    await expect(openScormPackage(await makeZip({ "a.html": "x" }))).rejects.toMatchObject({
      code: "no_manifest",
    });
  });

  it("errors when the root is ambiguous", async () => {
    await expect(
      openScormPackage(
        await makeZip({ "a/imsmanifest.xml": MANIFEST, "b/imsmanifest.xml": MANIFEST })
      )
    ).rejects.toMatchObject({ code: "ambiguous_manifest" });
  });
});

describe("openScormPackage hostile input", () => {
  it("neutralises a traversal entry without failing the package", async () => {
    const zipBytes = renameEntryInPlace(
      await makeZip({ "imsmanifest.xml": MANIFEST, "aa/x.sh": "rm -rf /" }),
      "aa/x.sh",
      "../x.sh"
    );
    const pkg = await openScormPackage(zipBytes);
    // JSZip's own reader resolves "../x.sh" to "x.sh" before openScormPackage
    // sees it, so the entry arrives already confined. What matters is that
    // nothing escapes the package root and the package still opens.
    //
    // normaliseEntryPath is the authority on the traversal rule and is tested
    // directly above; it covers what JSZip does NOT handle (backslashes, drive
    // letters, percent-encoding, NUL bytes, over-long paths) plus the
    // escapes_root check, which is this module's alone.
    expect(pkg.list().every((p) => !p.includes(".."))).toBe(true);
    expect(pkg.list()).toContain("imsmanifest.xml");
  });

  it("drops an entry that sits outside the detected package root", async () => {
    const pkg = await openScormPackage(
      await makeZip({
        "MyCourse/imsmanifest.xml": MANIFEST,
        "MyCourse/a.html": "x",
        "outside.sh": "rm -rf /",
      })
    );
    expect(pkg.root).toBe("MyCourse");
    expect(pkg.list().sort()).toEqual(["a.html", "imsmanifest.xml"]);
    expect(pkg.rejectedEntries().map((r) => r.reason)).toContain("escapes_root");
  });

  it("silently ignores __MACOSX and .DS_Store noise", async () => {
    const pkg = await openScormPackage(
      await makeZip({
        "imsmanifest.xml": MANIFEST,
        "__MACOSX/._a.html": "junk",
        ".DS_Store": "junk",
        "a.html": "x",
      })
    );
    expect(pkg.list().sort()).toEqual(["a.html", "imsmanifest.xml"]);
    expect(pkg.rejectedEntries()).toHaveLength(0);
  });

  it("refuses an archive over the size limit before parsing it", async () => {
    const big = Buffer.alloc(1024);
    await expect(openScormPackage(big, { maxArchiveBytes: 512 })).rejects.toMatchObject({
      code: "archive_too_large",
    });
  });

  it("refuses a highly compressible entry on its declared ratio", async () => {
    const bomb = "A".repeat(2 * 1024 * 1024); // deflates to a few KB
    const zipBytes = await makeZip({ "imsmanifest.xml": MANIFEST, "bomb.txt": bomb }, true);
    await expect(
      openScormPackage(zipBytes, { maxCompressionRatio: 50 })
    ).rejects.toMatchObject({ code: "compression_ratio" });
  });

  it("refuses the bomb before decompressing anything", async () => {
    const bomb = "A".repeat(2 * 1024 * 1024);
    const zipBytes = await makeZip({ "imsmanifest.xml": MANIFEST, "bomb.txt": bomb }, true);
    // The archive itself is tiny, so only the declared-size check can catch it.
    expect(zipBytes.length).toBeLessThan(100 * 1024);
    await expect(
      // Ratio check relaxed so the total-size check is what fires.
      openScormPackage(zipBytes, { maxTotalBytes: 1024 * 1024, maxCompressionRatio: 100000 })
    ).rejects.toMatchObject({ code: "total_too_large" });
  });

  it("refuses an entry over the per-file limit", async () => {
    await expect(
      openScormPackage(await makeZip({ "imsmanifest.xml": MANIFEST, "big.bin": "x".repeat(5000) }), {
        maxEntryBytes: 1000,
        maxCompressionRatio: 100000,
      })
    ).rejects.toMatchObject({ code: "entry_too_large" });
  });

  it("refuses too many entries", async () => {
    const files: Record<string, string> = { "imsmanifest.xml": MANIFEST };
    for (let i = 0; i < 20; i++) files[`f${i}.txt`] = "x";
    await expect(
      openScormPackage(await makeZip(files), { maxEntries: 5 })
    ).rejects.toMatchObject({ code: "too_many_entries" });
  });

  it("rejects a corrupt archive with a legible error", async () => {
    await expect(openScormPackage(Buffer.from("not a zip at all"))).rejects.toBeInstanceOf(
      ScormPackageError
    );
  });
});

describe("openScormPackage lookup and resolve", () => {
  it("matches a case-mismatched asset reference", async () => {
    const pkg = await openScormPackage(
      await makeZip({ "imsmanifest.xml": MANIFEST, "images/Logo.PNG": "bytes" })
    );
    expect(pkg.has("images/logo.png")).toBe(true);
  });

  it("resolves an href relative to the referring page's directory", async () => {
    const pkg = await openScormPackage(
      await makeZip({
        "imsmanifest.xml": MANIFEST,
        "content/sco1/index.html": "x",
        "content/sco1/img/a.png": "bytes",
        "shared/b.png": "bytes",
      })
    );
    expect(pkg.resolve("content/sco1/index.html", "img/a.png")).toBe("content/sco1/img/a.png");
    expect(pkg.resolve("content/sco1/index.html", "../../shared/b.png")).toBe("shared/b.png");
    // Root-relative.
    expect(pkg.resolve("content/sco1/index.html", "/shared/b.png")).toBe("shared/b.png");
  });

  it("strips a fragment and query before looking up", async () => {
    const pkg = await openScormPackage(
      await makeZip({ "imsmanifest.xml": MANIFEST, "content/a.html": "x" })
    );
    expect(pkg.resolve("imsmanifest.xml", "content/a.html#section2")).toBe("content/a.html");
    expect(pkg.resolve("imsmanifest.xml", "content/a.html?mode=review")).toBe("content/a.html");
  });

  it("returns null for an external URL, an escaping path and a missing entry", async () => {
    const pkg = await openScormPackage(
      await makeZip({ "imsmanifest.xml": MANIFEST, "content/a.html": "x" })
    );
    expect(pkg.resolve("content/a.html", "https://example.com/x.png")).toBeNull();
    expect(pkg.resolve("content/a.html", "javascript:alert(1)")).toBeNull();
    expect(pkg.resolve("content/a.html", "../../../../etc/passwd")).toBeNull();
    expect(pkg.resolve("content/a.html", "nope.png")).toBeNull();
  });

  it("tracks decompressed bytes handed out", async () => {
    const pkg = await openScormPackage(
      await makeZip({ "imsmanifest.xml": MANIFEST, "a.txt": "hello" })
    );
    expect(pkg.bytesRead()).toBe(0);
    await pkg.read("a.txt");
    expect(pkg.bytesRead()).toBe(5);
  });

  it("strips a UTF-8 BOM when reading text", async () => {
    const pkg = await openScormPackage(
      await makeZip({ "imsmanifest.xml": MANIFEST, "a.html": Buffer.from("\uFEFF<p>hi</p>", "utf8") })
    );
    expect(await pkg.readText("a.html")).toBe("<p>hi</p>");
  });
});
