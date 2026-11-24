import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "scorm-blob-"));
let blob: typeof import("./blob");

beforeAll(async () => {
  vi.stubEnv("STORAGE_DIR", dir);
  vi.resetModules();
  blob = await import("./blob");
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("local storage backend", () => {
  it("is selected by STORAGE_DIR", () => {
    expect(blob.storageBackend()).toBe("local");
    expect(blob.isBlobConfigured()).toBe(true);
  });

  it("round-trips a file through upload, find, fetchStored and delete", async () => {
    const { url } = await blob.uploadBlob("media/a b.png", Buffer.from("png-bytes"));
    expect(url).toBe("/files/media/a%20b.png");
    expect((await blob.findBlobByPathname("media/a b.png"))?.size).toBe(9);

    const res = await blob.fetchStored(url);
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await res.text()).toBe("png-bytes");

    await blob.deleteBlob(url);
    expect(await blob.findBlobByPathname("media/a b.png")).toBeNull();
    expect((await blob.fetchStored(url)).status).toBe(404);
  });

  it("adds a suffix instead of overwriting", async () => {
    const a = await blob.uploadBlob("x/f.txt", Buffer.from("1"));
    const b = await blob.uploadBlob("x/f.txt", Buffer.from("2"));
    expect(a.url).toBe("/files/x/f.txt");
    expect(b.url).toMatch(/^\/files\/x\/f-[0-9a-f]{12}\.txt$/);
    expect((await blob.listBlobs("x/")).length).toBe(2);
  });

  it("refuses paths outside the storage folder", async () => {
    await expect(blob.uploadBlob("../escape.txt", Buffer.from("no"))).rejects.toThrow();
    expect(blob.localPathnameFromUrl("/files/..%2F..%2Fsecret")).toBeNull();
    expect(blob.openLocalFile("../../etc/passwd")).toBeNull();
  });

  it("falls back to 404 for relative non-storage urls", async () => {
    expect((await blob.fetchStored("/api/whatever")).status).toBe(404);
  });
});
