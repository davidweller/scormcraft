import { describe, expect, it } from "vitest";
import {
  isSafeHref,
  sanitizeImportedRichText,
  sanitizePreviewHtml,
  sanitizeTableHtml,
  toPlainText,
} from "./sanitize";

describe("sanitizeImportedRichText", () => {
  it("drops script elements and their contents", () => {
    const out = sanitizeImportedRichText('<p>ok</p><script>alert(1)</script>');
    expect(out).toBe("<p>ok</p>");
    expect(out).not.toContain("alert");
  });

  it("strips event handler attributes", () => {
    const out = sanitizeImportedRichText('<p onclick="alert(1)">hi</p>');
    expect(out).toBe("<p>hi</p>");
  });

  it("rejects javascript: hrefs but keeps http ones", () => {
    expect(sanitizeImportedRichText('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript");
    const ok = sanitizeImportedRichText('<a href="https://example.com">x</a>');
    expect(ok).toContain('href="https://example.com"');
    expect(ok).toContain('rel="noopener noreferrer"');
  });

  it("drops img onerror and keeps safe sources", () => {
    expect(sanitizeImportedRichText('<img src="x" onerror="alert(1)" />')).not.toContain("onerror");
    expect(sanitizeImportedRichText('<img src="https://e.com/a.png" alt="a" />')).toContain("alt=\"a\"");
  });

  it("allows a base64 raster data URL but not data:text/html or SVG", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(sanitizeImportedRichText(`<img src="${png}" />`)).toContain(png);
    expect(sanitizeImportedRichText('<img src="data:text/html;base64,PHNjcmlwdD4=" />')).not.toContain("data:text/html");
    expect(sanitizeImportedRichText('<img src="data:image/svg+xml;base64,PHN2Zz4=" />')).not.toContain("svg+xml");
  });

  it("removes base, link, style, iframe and svg", () => {
    const out = sanitizeImportedRichText(
      '<base href="http://evil"><link rel="x"><style>b{}</style><iframe src="y"></iframe><svg><script>1</script></svg><p>keep</p>'
    );
    expect(out).toBe("<p>keep</p>");
  });

  it("survives malformed nesting without throwing", () => {
    expect(() => sanitizeImportedRichText("<p><strong>unclosed<p>next")).not.toThrow();
  });
});

describe("sanitizeTableHtml", () => {
  it("preserves colspan and rowspan", () => {
    const out = sanitizeTableHtml(
      '<table><tr><th colspan="2">H</th></tr><tr><td rowspan="2">a</td><td>b</td></tr></table>'
    );
    expect(out).toContain('colspan="2"');
    expect(out).toContain('rowspan="2"');
  });

  it("drops style and class attributes", () => {
    const out = sanitizeTableHtml('<table><tr><td style="color:red" class="x">a</td></tr></table>');
    expect(out).not.toContain("style");
    expect(out).not.toContain("class");
  });
});

describe("sanitizePreviewHtml", () => {
  it("strips images, whose bundle-relative paths would not resolve", () => {
    expect(sanitizePreviewHtml('<p>a</p><img src="assets/x.png" />')).toBe("<p>a</p>");
  });

  it("truncates past the cap", () => {
    const out = sanitizePreviewHtml(`<p>${"x".repeat(200)}</p>`, 50);
    expect(out.length).toBeLessThanOrEqual(51);
  });
});

describe("toPlainText", () => {
  it("turns br and block ends into newlines", () => {
    expect(toPlainText("line one<br />line two")).toBe("line one\nline two");
    // One newline per block boundary: nl2br on the render side reproduces it.
    expect(toPlainText("<p>a</p><p>b</p>")).toBe("a\nb");
  });

  it("removes markup and decodes entities", () => {
    expect(toPlainText("<p>Caf&eacute; <strong>bold</strong></p>")).toBe("Café bold");
  });

  it("returns empty string for empty input", () => {
    expect(toPlainText("")).toBe("");
  });
});

describe("isSafeHref", () => {
  it("accepts http, https, mailto and relative paths", () => {
    expect(isSafeHref("https://e.com")).toBe(true);
    expect(isSafeHref("mailto:a@b.c")).toBe(true);
    expect(isSafeHref("files/a.pdf")).toBe(true);
  });

  it("rejects javascript, data and file schemes", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,x")).toBe(false);
    expect(isSafeHref("file:///etc/passwd")).toBe(false);
    expect(isSafeHref("")).toBe(false);
  });
});
