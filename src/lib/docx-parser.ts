/**
 * DOCX parsing utilities using mammoth.js
 * Extracts text content and document structure from Word documents.
 */

import mammoth from "mammoth";

export interface ParsedHeading {
  level: number;
  text: string;
  index: number;
}

export interface ParsedListItem {
  text: string;
  isNumbered: boolean;
}

export interface ParsedDocument {
  rawText: string;
  html: string;
  headings: ParsedHeading[];
  paragraphs: string[];
  lists: ParsedListItem[];
  images: ParsedImage[];
}

export interface ParsedImage {
  token: string;
  contentType: string | null;
  base64: string;
  alt: string | null;
}

export async function parseDocx(buffer: ArrayBuffer): Promise<ParsedDocument> {
  const nodeBuffer = Buffer.from(buffer);
  
  const images: ParsedImage[] = [];

  // Convert to HTML, extracting images into placeholders
  // Use type assertion for mammoth's image handling which isn't fully typed
  const mammothAny = mammoth as unknown as {
    convertToHtml: (
      input: { buffer: Buffer },
      options?: { convertImage?: unknown }
    ) => Promise<{ value: string }>;
    images: {
      inline: (fn: (image: unknown) => Promise<{ src: string }>) => unknown;
    };
  };
  
  const result = await mammothAny.convertToHtml(
    { buffer: nodeBuffer },
    {
      convertImage: mammothAny.images.inline(async (image) => {
        const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${images.length}`;

        try {
          const imgAny = image as {
            contentType?: string;
            altText?: string;
            read: (encoding: "base64") => Promise<string>;
          };

          const base64 = await imgAny.read("base64");
          images.push({
            token,
            contentType: typeof imgAny.contentType === "string" ? imgAny.contentType : null,
            base64,
            alt: typeof imgAny.altText === "string" ? imgAny.altText : null,
          });
        } catch {
          // If we fail to read image bytes, still emit a placeholder token so
          // downstream can create a placeholder image block.
          images.push({
            token,
            contentType: null,
            base64: "",
            alt: null,
          });
        }

        return { src: `docx-image://${token}` };
      }),
    }
  );
  const html = result.value;

  const textResult = await mammoth.extractRawText({ buffer: nodeBuffer });
  const rawText = textResult.value;

  const headings = extractHeadings(html);
  const paragraphs = extractParagraphs(html);
  const lists = extractLists(html);

  return {
    rawText,
    html,
    headings,
    paragraphs,
    lists,
    images,
  };
}

function extractHeadings(html: string): ParsedHeading[] {
  const headings: ParsedHeading[] = [];
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  let match;
  let index = 0;

  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      text: stripHtmlTags(match[2]).trim(),
      index: index++,
    });
  }

  return headings;
}

function extractParagraphs(html: string): string[] {
  const paragraphs: string[] = [];
  const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi;
  let match;

  while ((match = paragraphRegex.exec(html)) !== null) {
    const text = stripHtmlTags(match[1]).trim();
    if (text) {
      paragraphs.push(text);
    }
  }

  return paragraphs;
}

function extractLists(html: string): ParsedListItem[] {
  const items: ParsedListItem[] = [];

  const orderedListRegex = /<ol[^>]*>(.*?)<\/ol>/gis;
  let olMatch;
  while ((olMatch = orderedListRegex.exec(html)) !== null) {
    const liRegex = /<li[^>]*>(.*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(olMatch[1])) !== null) {
      const text = stripHtmlTags(liMatch[1]).trim();
      if (text) {
        items.push({ text, isNumbered: true });
      }
    }
  }

  const unorderedListRegex = /<ul[^>]*>(.*?)<\/ul>/gis;
  let ulMatch;
  while ((ulMatch = unorderedListRegex.exec(html)) !== null) {
    const liRegex = /<li[^>]*>(.*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(ulMatch[1])) !== null) {
      const text = stripHtmlTags(liMatch[1]).trim();
      if (text) {
        items.push({ text, isNumbered: false });
      }
    }
  }

  return items;
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

export function formatDocumentForAI(doc: ParsedDocument): string {
  let content = doc.html;
  
  // Convert headings to markdown format (for structure recognition)
  content = content.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n\n# $1\n\n");
  content = content.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n\n## $1\n\n");
  content = content.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n\n### $1\n\n");
  content = content.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n\n#### $1\n\n");
  content = content.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "\n\n##### $1\n\n");
  content = content.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "\n\n###### $1\n\n");
  
  // Keep paragraphs as HTML tags (strip attributes)
  content = content.replace(/<p[^>]*>/gi, "<p>");
  
  // Keep lists as clean HTML (strip attributes)
  content = content.replace(/<ul[^>]*>/gi, "<ul>");
  content = content.replace(/<ol[^>]*>/gi, "<ol>");
  content = content.replace(/<li[^>]*>/gi, "<li>");
  
  // Keep inline formatting as clean HTML (strip attributes)
  content = content.replace(/<strong[^>]*>/gi, "<strong>");
  content = content.replace(/<b\b[^>]*>/gi, "<strong>");
  content = content.replace(/<\/b>/gi, "</strong>");
  content = content.replace(/<em[^>]*>/gi, "<em>");
  // Important: use a word-boundary so <img> doesn't match this regex.
  content = content.replace(/<i\b[^>]*>/gi, "<em>");
  content = content.replace(/<\/i>/gi, "</em>");
  
  // Preserve table tags (strip attributes for security)
  content = content.replace(/<table[^>]*>/gi, "<table>");
  content = content.replace(/<thead[^>]*>/gi, "<thead>");
  content = content.replace(/<tbody[^>]*>/gi, "<tbody>");
  content = content.replace(/<tr[^>]*>/gi, "<tr>");
  content = content.replace(/<th\b[^>]*>/gi, "<th>");
  content = content.replace(/<td[^>]*>/gi, "<td>");
  
  // Keep docx image placeholders as explicit markers the AI can turn into image blocks.
  // mammoth emits <img src="docx-image://TOKEN" ...>; convert those to [[IMAGE_TOKEN:TOKEN]].
  content = content.replace(
    /<img[^>]*\ssrc=["']docx-image:\/\/([^"']+)["'][^>]*>/gi,
    (_m, token) => `[[IMAGE_TOKEN:${String(token)}]]`
  );
  // Remove any remaining <img> tags (e.g., unsupported/external) for safety.
  content = content.replace(/<img[^>]*>/gi, "");

  // If italics appear to be accidentally applied to nearly all paragraphs, strip <em> globally.
  // Otherwise preserve genuine emphasis.
  const totalParagraphs = (content.match(/<p>/gi) || []).length;
  const fullyItalicParagraphs = (content.match(/<p><em>[\s\S]*?<\/em><\/p>/gi) || []).length;
  const fullyItalicRatio = totalParagraphs > 0 ? fullyItalicParagraphs / totalParagraphs : 0;
  if (totalParagraphs >= 3 && fullyItalicRatio >= 0.8) {
    content = content.replace(/<em>/gi, "").replace(/<\/em>/gi, "");
  }
  content = content.replace(/<(?!\/?(p|ul|ol|li|strong|em|table|thead|tbody|tr|th|td)(?:>|\s))[^>]*>/gi, "");
  
  // Convert non-breaking spaces to regular spaces
  content = content.replace(/&nbsp;/g, " ");
  content = content.replace(/\u00A0/g, " ");
  
  // Clean up excessive whitespace
  content = content.replace(/\n{3,}/g, "\n\n");
  content = content.trim();
  
  return `=== DOCUMENT CONTENT ===

The document below uses markdown-style headings (# H1, ## H2, ### H3) for structure.
Text content includes HTML formatting that should be preserved in the output:
- <p>...</p> for paragraphs
- <ul><li>...</li></ul> for bullet lists
- <ol><li>...</li></ol> for numbered lists
- <strong>...</strong> for bold text
- <em>...</em> for italic text
- <table>...</table> for tables

${content}`;
}
