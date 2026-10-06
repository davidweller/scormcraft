/**
 * Server-side HTML sanitisation.
 *
 * Sanitisation happens at BOTH ends: at import, so the database only ever holds
 * clean HTML (which protects the editor, the preview route and the DOCX
 * exporter at once), and at render, because the database is not a trust
 * boundary worth betting the app on and hand-authored table HTML still arrives
 * through the editor.
 *
 * Client components must not import this module — it pulls htmlparser2 into the
 * bundle. Use ./sanitize-client there.
 */

import sanitizeHtml from "sanitize-html";
import {
  ALLOWED_ATTRIBUTES,
  ALLOWED_IMAGE_DATA_URL,
  ALLOWED_TAGS,
  ALLOWED_URL_SCHEMES,
  FORBIDDEN_ATTR_PATTERN,
  FORBIDDEN_TAGS,
} from "./allowlist";

/** Drop any attribute whose name looks like an event handler. */
function stripHandlerAttributes(
  attribs: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(attribs)) {
    if (FORBIDDEN_ATTR_PATTERN.test(name)) continue;
    out[name] = value;
  }
  return out;
}

const BASE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: ALLOWED_ATTRIBUTES,
  disallowedTagsMode: "discard",
  allowedSchemes: [...ALLOWED_URL_SCHEMES],
  allowedSchemesByTag: { img: [...ALLOWED_URL_SCHEMES, "data"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  enforceHtmlBoundary: false,
  nonTextTags: [...FORBIDDEN_TAGS],
  transformTags: {
    "*": (tagName, attribs) => ({ tagName, attribs: stripHandlerAttributes(attribs) }),
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...stripHandlerAttributes(attribs),
        // Links in SCORM content open inside an LMS frame; a new tab is the
        // only safe target, and noopener is mandatory with it.
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
    img: (tagName, attribs) => {
      const clean = stripHandlerAttributes(attribs);
      const src = clean.src ?? "";
      // A data: URL is only acceptable as a real raster image. data:text/html
      // and data:image/svg+xml both execute script.
      if (src.startsWith("data:") && !ALLOWED_IMAGE_DATA_URL.test(src)) {
        delete clean.src;
      }
      return { tagName, attribs: clean };
    },
  },
};

/** Rich text destined for a `text`, `key_insight` or `key_point.text` field. */
export function sanitizeImportedRichText(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, BASE_OPTIONS);
}

/** Table markup destined for a `table.html` field. Keeps colspan/rowspan. */
export function sanitizeTableHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, BASE_OPTIONS);
}

/**
 * A static preview of a preserved (embedded_html) page, for the editor.
 *
 * Images are stripped to placeholders rather than kept: their paths are
 * relative to the preserved bundle and will not resolve in the editor, so a
 * kept <img> renders as a broken-image icon.
 */
export function sanitizePreviewHtml(html: string, maxLength = 32 * 1024): string {
  if (!html) return "";
  const cleaned = sanitizeHtml(html, {
    ...BASE_OPTIONS,
    allowedTags: [...ALLOWED_TAGS].filter((t) => t !== "img"),
  });
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}

/**
 * Collapse HTML to plain text, for fields the renderer will escape
 * (question, prompt, options, items, card faces). Block-level boundaries become
 * newlines so that `nl2br` on the render side reproduces the line breaks.
 */
export function toPlainText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, "\n");
  const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return stripped
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Reject a URL that is not http(s)/mailto, mirroring the existing file_download
 * guard in render-page-html.ts. Relative paths are allowed: inside a SCORM
 * package they are the normal case.
 */
export function isSafeHref(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) return true; // relative path
  return (ALLOWED_URL_SCHEMES as readonly string[]).includes(schemeMatch[1].toLowerCase());
}
