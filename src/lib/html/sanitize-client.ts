"use client";

/**
 * Client-side sanitisation for the editor's `dangerouslySetInnerHTML` sites.
 *
 * Uses DOMPurify rather than sanitize-html so htmlparser2 stays out of the
 * browser bundle. The allowlist is shared with the server sanitiser.
 */

import DOMPurify from "dompurify";
import {
  ALLOWED_ATTRIBUTES,
  ALLOWED_TAGS,
  FORBIDDEN_TAGS,
} from "./allowlist";

const ALLOWED_ATTR = Array.from(
  new Set(Object.values(ALLOWED_ATTRIBUTES).flat())
);

/**
 * Returns sanitised HTML, or "" when no DOM is available.
 *
 * Client components are also rendered on the server, where DOMPurify has no
 * window and `sanitize` is undefined. Returning "" there means the preview
 * appears on hydration rather than throwing during SSR.
 */
export function sanitizeHtmlClient(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined" || typeof DOMPurify.sanitize !== "function") {
    return "";
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR,
    FORBID_TAGS: [...FORBIDDEN_TAGS],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    USE_PROFILES: { html: true },
  });
}
