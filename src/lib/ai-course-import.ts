/**
 * AI-powered course import from DOCX documents.
 * Uses the configured AI provider (src/lib/llm) to analyze document content
 * and extract course structure.
 *
 * Large docs are split on Module headings and analyzed per-section so a single
 * AI call cannot hang for 10+ minutes generating 65k tokens of JSON.
 */

import { LlmTimeoutError, parseJsonObject, type LlmProvider } from "@/lib/llm";
import type {
  ContentBlockType,
  InteractionBlockType,
  MultipleChoiceConfig,
  TrueFalseConfig,
  ReflectionConfig,
  DragAndDropConfig,
  MatchingConfig,
  DialogCardsConfig,
} from "@/types/course";

/** Soft cap for a single section completion — keeps per-call latency bounded. */
const SECTION_MAX_OUTPUT_TOKENS = 16384;
const METADATA_MAX_OUTPUT_TOKENS = 4096;

export interface ImportedBlock {
  category: "content" | "interaction";
  type: ContentBlockType | InteractionBlockType;
  data: Record<string, unknown>;
}

export interface ImportedPage {
  title: string;
  blocks: ImportedBlock[];
}

export interface ImportedLesson {
  title: string;
  pages: ImportedPage[];
}

export interface ImportedModule {
  title: string;
  lessons: ImportedLesson[];
}

export interface ImportedCourseData {
  title: string;
  overview: string;
  audience?: string;
  tone?: string;
  ilos: string[];
  assessmentPlan?: string;
  modules: ImportedModule[];
}

interface DocumentSection {
  title: string;
  content: string;
  kind: "introduction" | "module";
}

const BLOCK_TYPES_PROMPT = `CONTENT BLOCK TYPES - CRITICAL: Every paragraph becomes a "text" block with category "content":
- "text": { "text": "<p>The actual paragraph text goes here</p>" } - USE FOR ALL PARAGRAPHS
- "text": { "text": "<ul><li>Item 1</li><li>Item 2</li></ul>" } - USE FOR BULLET LISTS
- "text": { "text": "<ol><li>Step 1</li><li>Step 2</li></ol>" } - USE FOR NUMBERED LISTS
- "heading": { "level": 2, "text": "Heading text" } - USE FOR H2/## HEADINGS
- "heading": { "level": 3, "text": "Subheading text" } - USE FOR H3/### HEADINGS
- "image": { "url": "https://...", "alt": "description" } - USE FOR IMAGES (see marker rule below)
- "video_embed": { "url": "https://..." } - USE FOR VIDEO MARKERS / YouTube URLs
- "key_insight": { "text": "<p>Important insight text</p>" } - from "Key Insight:" lines
- "key_point": { "title": "optional title", "text": "<p>Point content</p>" } - from "Key Point:" lines
- "table": { "html": "<table>...</table>" }

INTERACTION BLOCK TYPES (for quizzes/questions):
- "multiple_choice": { "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "..." }
- "true_false": { "question": "...", "correct": true|false, "explanation": "..." }
- "reflection": { "prompt": "..." }
- "drag_and_drop": { "question": "...", "items": [...], "correctOrder": [...], "explanation": "..." }
- "matching": { "question": "...", "pairs": [{"left":"...","right":"..."}], "explanation": "..." }
- "dialog_cards": { "title": "...", "cards": [{"front":"...","back":"..."}] }

CRITICAL RULES:
1. EVERY paragraph MUST become a block with full text — do not summarize or omit.
2. Keep content in document order.
3. H2/## -> heading level 2; H3/### -> heading level 3. Input may be markdown or HTML; block text/key_*/table fields MUST still be HTML (<p>, <ul>, <strong>, <em>, <table>).
4. Quiz patterns become interaction blocks and REPLACE the corresponding text (do not duplicate):
   - "Quiz:", "Question:", "**Q1 (Single choice)**", "**Q2 (Single choice)**", etc.
   - Options like "- A) …", "- B) … *(correct)*" — set correctIndex from the *(correct)* marker (or "(correct)").
   - "**Feedback (if correct):**" / "**Feedback (if incorrect):**" — put the correct-path feedback in "explanation".
   - "True or False:", "Match:", "Flashcards:", "Reflection:"
5. Flashcards: "**Front:**" / "**Back:**" pairs (under a Flashcards heading or label) → dialog_cards.
6. Preserve <strong> and <em> (from HTML or converted from ** / *).
7. IMAGE MARKERS [[IMAGE url="..." alt="..."]] must become image blocks at that position (not wrapped in text). Empty url is allowed.
8. VIDEO MARKERS [[VIDEO url="..."]] (or bare YouTube URLs) must become video_embed blocks at that position.
9. A substantial section should have many blocks; few blocks usually means missing content.`;

const METADATA_SYSTEM_PROMPT = `You extract course metadata from a training document. Respond with JSON only:
{
  "title": "Course title",
  "overview": "2-4 sentence course description",
  "audience": "Target audience if mentioned, else empty string",
  "tone": "formal|conversational|technical|friendly",
  "ilos": ["Learning outcome 1", ...],
  "assessmentPlan": "Assessment approach if mentioned, else empty string"
}
Use only information present in the document. If a field is unknown, use an empty string or empty array.`;

const SECTION_SYSTEM_PROMPT = `You are an expert instructional designer. Convert ONE course section into ordered content/interaction blocks as JSON.

REQUIRED OUTPUT FORMAT:
{
  "blocks": [
    { "category": "content", "type": "text", "data": { "text": "<p>...</p>" } }
  ]
}

${BLOCK_TYPES_PROMPT}

Do not invent modules or lessons — only return the blocks array for this section.
IMPORTANT: The section title becomes the page title automatically. Do NOT create a heading block that repeats the section title (e.g. "Module 1: ..."). Start with the first real content after that title (e.g. "Module Overview").`;

function isTimeoutError(error: unknown): boolean {
  if (error instanceof LlmTimeoutError) return true;
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string; code?: string };
  if (e.name === "APIConnectionTimeoutError") return true;
  if (e.code === "ETIMEDOUT" || e.code === "ECONNABORTED") return true;
  return typeof e.message === "string" && /timed?\s*out|timeout/i.test(e.message);
}

/**
 * Split on "# Module N..." and "Course Conclusion" headings so each AI call
 * stays small enough to finish. Content before the first Module heading becomes
 * an Introduction section.
 */
export function splitDocumentIntoSections(documentContent: string): DocumentSection[] {
  const sectionRegex = /^(#{1,3})\s*((?:Module\s+\d+|Course Conclusion)[^\n]*)$/gim;
  const matches = [...documentContent.matchAll(sectionRegex)];

  if (matches.length === 0) {
    return [{ title: "Course Content", content: documentContent, kind: "module" }];
  }

  const sections: DocumentSection[] = [];
  const firstSectionIndex = matches[0].index ?? 0;
  const intro = documentContent.slice(0, firstSectionIndex).trim();
  const introBody = intro
    .replace(/^=== DOCUMENT CONTENT ===[\s\S]*?(?=\n\n)/, "")
    .trim();
  if (introBody.length > 80) {
    sections.push({ title: "Introduction", content: intro, kind: "introduction" });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0;
    const end =
      i + 1 < matches.length
        ? (matches[i + 1].index ?? documentContent.length)
        : documentContent.length;
    const title = (matches[i][2] || `Module ${i + 1}`).trim();
    sections.push({
      title,
      content: documentContent.slice(start, end).trim(),
      kind: "module",
    });
  }

  return sections;
}

function normalizeTitleForCompare(value: string): string {
  return value
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Drop a leading heading that only repeats the page/module title. */
function stripRedundantTitleHeading(title: string, blocks: ImportedBlock[]): ImportedBlock[] {
  if (blocks.length === 0) return blocks;
  const normalizedTitle = normalizeTitleForCompare(title);
  if (!normalizedTitle) return blocks;

  let start = 0;
  while (start < blocks.length) {
    const block = blocks[start];
    if (block.category !== "content" || block.type !== "heading") break;
    const text = typeof block.data?.text === "string" ? block.data.text : "";
    if (!text || normalizeTitleForCompare(text) !== normalizedTitle) break;
    start += 1;
  }
  return start > 0 ? blocks.slice(start) : blocks;
}

/** Remove the leading "# Module N..." line so the model is less likely to re-emit it. */
function contentWithoutSectionTitle(section: DocumentSection): string {
  const titleNorm = normalizeTitleForCompare(section.title);
  const lines = section.content.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;
  if (i < lines.length) {
    const headingMatch = lines[i].match(/^#{1,3}\s*(.+)$/);
    if (headingMatch && normalizeTitleForCompare(headingMatch[1]) === titleNorm) {
      i += 1;
      while (i < lines.length && !lines[i].trim()) i += 1;
      return lines.slice(i).join("\n").trim();
    }
  }
  return section.content;
}

function moduleFromSection(title: string, blocks: ImportedBlock[]): ImportedModule {
  return {
    title,
    lessons: [
      {
        title,
        pages: [{ title, blocks: stripRedundantTitleHeading(title, blocks) }],
      },
    ],
  };
}

async function extractCourseMetadata(
  llm: LlmProvider,
  documentContent: string,
  moduleTitles: string[]
): Promise<Pick<ImportedCourseData, "title" | "overview" | "audience" | "tone" | "ilos" | "assessmentPlan">> {
  const head = documentContent.slice(0, 12000);
  const titlesHint =
    moduleTitles.length > 0
      ? `\nKnown module titles: ${moduleTitles.join(" | ")}`
      : "";

  console.log(`[Import] Extracting metadata (${head.length} chars)...`);
  const startTime = Date.now();
  const { text } = await llm.completeJson({
    tier: "import",
    label: "metadata",
    system: METADATA_SYSTEM_PROMPT,
    user: `Extract course metadata from this document.${titlesHint}\n\n${head}`,
    maxOutputTokens: METADATA_MAX_OUTPUT_TOKENS,
  });
  console.log(`[Import] Metadata done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  if (!text) {
    return {
      title: "Imported Course",
      overview: "",
      audience: "",
      tone: undefined,
      ilos: [],
      assessmentPlan: "",
    };
  }

  try {
    const parsed = parseJsonObject<Partial<ImportedCourseData>>(text);
    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Imported Course",
      overview: typeof parsed.overview === "string" ? parsed.overview : "",
      audience: typeof parsed.audience === "string" ? parsed.audience : undefined,
      tone: typeof parsed.tone === "string" ? parsed.tone : undefined,
      ilos: Array.isArray(parsed.ilos)
        ? parsed.ilos.filter((x): x is string => typeof x === "string")
        : [],
      assessmentPlan: typeof parsed.assessmentPlan === "string" ? parsed.assessmentPlan : undefined,
    };
  } catch {
    return {
      title: "Imported Course",
      overview: "",
      audience: undefined,
      tone: undefined,
      ilos: [],
      assessmentPlan: undefined,
    };
  }
}

async function extractSectionBlocks(
  llm: LlmProvider,
  section: DocumentSection,
  index: number,
  total: number
): Promise<ImportedBlock[]> {
  const sectionBody = contentWithoutSectionTitle(section);
  console.log(
    `[Import] Section ${index + 1}/${total}: "${section.title}" (${sectionBody.length} chars)...`
  );
  const startTime = Date.now();

  const { text, truncated } = await llm.completeJson({
    tier: "import",
    label: `section ${index + 1}`,
    system: SECTION_SYSTEM_PROMPT,
    user: `Extract blocks for section "${section.title}". Do not include a heading for that title — it is already the page title.\n\n${sectionBody}`,
    maxOutputTokens: SECTION_MAX_OUTPUT_TOKENS,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (!text) {
    console.warn(`[Import] Section ${index + 1} empty response after ${elapsed}s`);
    return [];
  }

  console.log(
    `[Import] Section ${index + 1} done in ${elapsed}s (${text.length} chars, truncated=${truncated})`
  );

  try {
    const parsed = parseJsonObject<{ blocks?: ImportedBlock[] }>(text);
    return Array.isArray(parsed.blocks) ? parsed.blocks : [];
  } catch (e) {
    const parseError = e instanceof Error ? e.message : "Unknown parse error";
    throw new Error(`Failed to parse section "${section.title}" as JSON: ${parseError}`);
  }
}

export async function analyzeCourseDocument(
  llm: LlmProvider,
  documentContent: string
): Promise<ImportedCourseData> {
  const startTime = Date.now();
  const sections = splitDocumentIntoSections(documentContent);
  const moduleTitles = sections
    .filter((s) => s.kind === "module" && /^Module\s+\d+/i.test(s.title))
    .map((s) => s.title);

  console.log(
    `[Import] Analyzing document (${documentContent.length} chars) with ${llm.label}`
  );
  console.log(
    `[Import] Split into ${sections.length} section(s): ${sections.map((s) => s.title).join(" | ")}`
  );

  try {
    const metadata = await extractCourseMetadata(llm, documentContent, moduleTitles);

    const modules: ImportedModule[] = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const blocks = await extractSectionBlocks(llm, section, i, sections.length);
      modules.push(moduleFromSection(section.title, blocks));
    }

    const parsed: ImportedCourseData = {
      ...metadata,
      modules,
    };

    const result = validateAndNormalizeImportedCourse(parsed);
    const counts = countImportedContent(result);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[Import] Completed in ${elapsed}s — ${counts.modules} modules, ${counts.lessons} lessons, ${counts.pages} pages, ${counts.contentBlocks} content blocks, ${counts.interactions} interactions`
    );
    return result;
  } catch (e) {
    if (isTimeoutError(e)) {
      throw new Error(
        `Document analysis timed out while calling ${llm.label}. Large modules are processed one at a time — retry, or split the Word document into smaller files.`
      );
    }
    throw e;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function decodePossiblyEscapedHtml(value: string): string {
  let out = value;
  // Some model outputs arrive double-escaped (e.g. &amp;lt;strong&amp;gt;).
  for (let i = 0; i < 2; i++) {
    const decoded = decodeHtmlEntities(out);
    if (decoded === out) break;
    out = decoded;
  }
  return out;
}

function normalizeContentBlockData(block: ImportedBlock): ImportedBlock {
  if (block.category !== "content") return block;
  const data = (block.data ?? {}) as Record<string, unknown>;

  if (block.type === "text" || block.type === "key_insight") {
    const text = typeof data.text === "string" ? data.text : "";
    return {
      ...block,
      data: {
        ...data,
        text: decodePossiblyEscapedHtml(text),
      },
    };
  }

  if (block.type === "key_point") {
    const text = typeof data.text === "string" ? data.text : "";
    return {
      ...block,
      data: {
        ...data,
        text: decodePossiblyEscapedHtml(text),
      },
    };
  }

  if (block.type === "table") {
    const html = typeof data.html === "string" ? data.html : "";
    return {
      ...block,
      data: {
        ...data,
        html: decodePossiblyEscapedHtml(html),
      },
    };
  }

  return block;
}

function validateAndNormalizeImportedCourse(data: ImportedCourseData): ImportedCourseData {
  if (!data.title || typeof data.title !== "string") {
    data.title = "Imported Course";
  }

  if (!data.overview || typeof data.overview !== "string") {
    data.overview = "";
  }

  if (!Array.isArray(data.ilos)) {
    data.ilos = [];
  }

  if (!Array.isArray(data.modules)) {
    data.modules = [];
  }

  for (const mod of data.modules) {
    if (!mod.title) mod.title = "Untitled Module";
    if (!Array.isArray(mod.lessons)) mod.lessons = [];

    for (const lesson of mod.lessons) {
      if (!lesson.title) lesson.title = "Untitled Lesson";
      if (!Array.isArray(lesson.pages)) lesson.pages = [];

      for (const page of lesson.pages) {
        if (!page.title) page.title = "Untitled Page";
        if (!Array.isArray(page.blocks)) page.blocks = [];

        const originalCount = page.blocks.length;
        // Deterministically convert any [[IMAGE ...]] markers that slipped into text blocks
        // into separate image blocks. This avoids relying on the model to always create
        // proper image blocks from markers.
        page.blocks = expandVideoMarkersInBlocks(
          expandImageMarkersInBlocks(page.blocks)
        ).map(normalizeContentBlockData);

        // Now validate/filter blocks (after expansion) so image blocks are retained.
        page.blocks = page.blocks.filter((block) => {
          if (!block.category || !block.type || !block.data) {
            console.log(`[Import] Filtering block - missing fields:`, { category: block.category, type: block.type, hasData: !!block.data });
            return false;
          }
          const valid = validateBlock(block);
          if (!valid) {
            console.log(`[Import] Filtering invalid block:`, { category: block.category, type: block.type });
          }
          return valid;
        });

        // Page title is rendered separately (micro-label + h1); drop a duplicate title heading.
        const beforeTitleStrip = page.blocks.length;
        page.blocks = stripRedundantTitleHeading(page.title, page.blocks);
        if (page.blocks.length !== beforeTitleStrip) {
          console.log(`[Import] Removed duplicate title heading from page "${page.title}"`);
        }

        if (page.blocks.length !== originalCount) {
          console.log(`[Import] Filtered ${originalCount - page.blocks.length} blocks from page "${page.title}"`);
        }
      }
    }
  }

  return data;
}

function expandImageMarkersInBlocks(blocks: ImportedBlock[]): ImportedBlock[] {
  return expandMarkersInTextBlocks(blocks, /\[\[IMAGE url="([^"]*)" alt="([^"]*)"\]\]/g, (m) => ({
    category: "content",
    type: "image",
    data: {
      url: m[1] || "",
      alt: (m[2] || "").replaceAll("&quot;", "\""),
    },
  }));
}

function expandVideoMarkersInBlocks(blocks: ImportedBlock[]): ImportedBlock[] {
  return expandMarkersInTextBlocks(blocks, /\[\[VIDEO url="([^"]*)"\]\]/g, (m) => ({
    category: "content",
    type: "video_embed",
    data: { url: m[1] || "" },
  }));
}

function expandMarkersInTextBlocks(
  blocks: ImportedBlock[],
  markerRegex: RegExp,
  toBlock: (match: RegExpExecArray) => ImportedBlock
): ImportedBlock[] {
  const out: ImportedBlock[] = [];

  for (const block of blocks) {
    if (block.category !== "content" || block.type !== "text") {
      out.push(block);
      continue;
    }
    const data = block.data as { text?: unknown };
    const text = typeof data?.text === "string" ? data.text : "";
    const probe = new RegExp(markerRegex.source, markerRegex.flags);
    if (!text || !probe.test(text)) {
      out.push(block);
      continue;
    }

    markerRegex.lastIndex = 0;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = markerRegex.exec(text)) !== null) {
      const before = text.slice(lastIndex, m.index);

      if (before.trim()) {
        out.push({
          category: "content",
          type: "text",
          data: { text: before },
        });
      }

      out.push(toBlock(m));
      lastIndex = m.index + m[0].length;
    }

    const after = text.slice(lastIndex);
    if (after.trim()) {
      out.push({
        category: "content",
        type: "text",
        data: { text: after },
      });
    }
  }

  return out;
}

const VALID_CONTENT_TYPES = new Set([
  "text",
  "heading",
  "image",
  "video_embed",
  "key_insight",
  "key_point",
  "table",
]);
const VALID_INTERACTION_TYPES = new Set(["multiple_choice", "true_false", "reflection", "drag_and_drop", "matching", "dialog_cards"]);

function validateBlock(block: ImportedBlock): boolean {
  if (block.category === "content") {
    if (!VALID_CONTENT_TYPES.has(block.type)) return false;
    if (block.type === "image") {
      const data = block.data as { url?: unknown; alt?: unknown };
      // url may be empty string for placeholders, a data: URL, or an https URL.
      if (typeof data.url !== "string") return false;
      if (data.alt != null && typeof data.alt !== "string") return false;
      return true;
    }
    if (block.type === "table") {
      const data = block.data as { html?: string };
      return typeof data.html === "string" && data.html.length > 0;
    }
    return true;
  }
  if (block.category === "interaction") {
    if (!VALID_INTERACTION_TYPES.has(block.type)) return false;
    return validateInteractionData(block.type as InteractionBlockType, block.data);
  }
  return false;
}

function validateInteractionData(type: InteractionBlockType, data: Record<string, unknown>): boolean {
  switch (type) {
    case "multiple_choice": {
      const mc = data as Partial<MultipleChoiceConfig>;
      return (
        typeof mc.question === "string" &&
        Array.isArray(mc.options) &&
        mc.options.length >= 2 &&
        typeof mc.correctIndex === "number" &&
        mc.correctIndex >= 0 &&
        mc.correctIndex < mc.options.length
      );
    }
    case "true_false": {
      const tf = data as Partial<TrueFalseConfig>;
      return typeof tf.question === "string" && typeof tf.correct === "boolean";
    }
    case "reflection": {
      const r = data as Partial<ReflectionConfig>;
      return typeof r.prompt === "string";
    }
    case "drag_and_drop": {
      const dd = data as Partial<DragAndDropConfig>;
      return (
        typeof dd.question === "string" &&
        Array.isArray(dd.items) &&
        dd.items.length >= 2 &&
        Array.isArray(dd.correctOrder) &&
        dd.correctOrder.length === dd.items.length
      );
    }
    case "matching": {
      const m = data as Partial<MatchingConfig>;
      return (
        typeof m.question === "string" &&
        Array.isArray(m.pairs) &&
        m.pairs.length >= 2 &&
        m.pairs.every((p) => typeof p.left === "string" && typeof p.right === "string")
      );
    }
    case "dialog_cards": {
      const dc = data as Partial<DialogCardsConfig>;
      return (
        Array.isArray(dc.cards) &&
        dc.cards.length >= 1 &&
        dc.cards.every((c) => typeof c.front === "string" && typeof c.back === "string")
      );
    }
    default:
      return false;
  }
}

export function countImportedContent(data: ImportedCourseData): {
  modules: number;
  lessons: number;
  pages: number;
  contentBlocks: number;
  interactions: number;
} {
  let lessons = 0;
  let pages = 0;
  let contentBlocks = 0;
  let interactions = 0;

  for (const mod of data.modules) {
    lessons += mod.lessons.length;
    for (const lesson of mod.lessons) {
      pages += lesson.pages.length;
      for (const page of lesson.pages) {
        for (const block of page.blocks) {
          if (block.category === "content") contentBlocks++;
          else if (block.category === "interaction") interactions++;
        }
      }
    }
  }

  return {
    modules: data.modules.length,
    lessons,
    pages,
    contentBlocks,
    interactions,
  };
}
