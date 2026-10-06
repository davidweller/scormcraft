/**
 * The single HTML allowlist, shared by the server sanitiser (sanitize-html) and
 * the client sanitiser (DOMPurify).
 *
 * This file must stay dependency-free: it is imported by both a server module
 * and a browser module.
 */

/** Tags permitted in stored rich text and in imported content. */
export const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre", "blockquote",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "figure", "figcaption", "img",
  "sup", "sub", "span",
] as const;

/**
 * Attributes permitted per tag. Anything not listed is dropped, which is what
 * kills every `on*` handler — but see FORBIDDEN_ATTR_PATTERN for the explicit
 * belt-and-braces rule.
 */
export const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  // target/rel are forced on by the sanitiser's transform; they have to be
  // allowed here or the allowlist strips them straight back off again.
  a: ["href", "title", "target", "rel"],
  img: ["src", "alt", "title", "width", "height"],
  th: ["colspan", "rowspan", "scope"],
  td: ["colspan", "rowspan", "headers"],
  // Tables carry colspan/rowspan through a round-trip; the previous hand-rolled
  // export sanitiser stripped every attribute and silently lost them.
};

/** Tags removed along with their contents, never merely unwrapped. */
export const FORBIDDEN_TAGS = [
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "select", "textarea", "base", "link", "meta", "applet", "frame", "frameset",
  "svg", "math", "noscript", "template",
] as const;

export const ALLOWED_URL_SCHEMES = ["http", "https", "mailto"] as const;

/** `data:` URLs are permitted on <img> only, and only for real raster images. */
export const ALLOWED_IMAGE_DATA_URL = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i;

/**
 * Explicit handler-attribute guard. The per-tag allowlist above already drops
 * these, but this exists so that adding an attribute to ALLOWED_ATTRIBUTES can
 * never accidentally reopen handler injection.
 */
export const FORBIDDEN_ATTR_PATTERN = /^on/i;

/**
 * Block data fields that hold HTML, versus fields that hold plain text.
 *
 * This asymmetry is load-bearing in both directions. `renderContentBlock`
 * passes HTML fields through the sanitiser and plain-text fields through
 * escapeHtml/nl2br; the SCORM importer has to reverse exactly that. Getting it
 * backwards shows escaped tags literally in the editor, or puts raw HTML into a
 * field the renderer will escape.
 */
export const HTML_BLOCK_FIELDS: Record<string, readonly string[]> = {
  text: ["text"],
  key_insight: ["text"],
  key_point: ["text"],
  table: ["html"],
};

/** Every other authored field is plain text. */
export const PLAIN_TEXT_BLOCK_FIELDS: Record<string, readonly string[]> = {
  heading: ["text"],
  image: ["alt", "caption"],
  key_point: ["title"],
  file_download: ["filename", "label", "description"],
  multiple_choice: ["question", "options", "explanation"],
  true_false: ["question", "explanation"],
  reflection: ["prompt"],
  drag_and_drop: ["question", "items", "explanation"],
  matching: ["question", "pairs", "explanation"],
  dialog_cards: ["title", "cards"],
};

export function isHtmlField(blockType: string, field: string): boolean {
  return (HTML_BLOCK_FIELDS[blockType] ?? []).includes(field);
}
