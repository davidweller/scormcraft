/**
 * Render a course to a Word document: modules, lessons and pages become headings,
 * blocks become paragraphs, tables, images and question sets.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx";
import type { BlockForExport, CourseForExport } from "@/lib/scorm/build-package";

type DocChild = Paragraph | Table;

export interface DocxExportOptions {
  /** Mark correct answers and include explanations. Off gives a learner-facing workbook. */
  includeAnswers?: boolean;
}

const NUMBERED = "numbered";
const MAX_IMAGE_WIDTH = 600;

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function heading(text: string, level: number): Paragraph {
  return new Paragraph({ text, heading: HEADING_LEVELS[Math.min(6, Math.max(1, level)) - 1] });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function hexColour(v: unknown): string | undefined {
  const s = str(v).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return s.slice(1).split("").map((c) => c + c).join("").toUpperCase();
  return undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Plain text with newlines: blank lines split paragraphs, single newlines become breaks. */
function plainToParagraphs(text: string, props: IParagraphOptions = {}, lead: TextRun[] = []): Paragraph[] {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p, pi) => {
      const lines = p.split("\n");
      return new Paragraph({
        ...props,
        children: [
          ...(pi === 0 ? lead : []),
          ...lines.map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 })),
        ],
      });
    });
}

interface RichTextContext {
  /** Each ordered list gets its own instance so numbering restarts at 1. */
  nextListInstance: () => number;
}

/**
 * Convert the editor's restricted HTML (p, strong/b, em/i, a, ul/ol/li, br, table) to docx paragraphs.
 * Anything else is dropped, matching sanitizeRichText in the SCORM renderer.
 * `lead` runs (e.g. a bold "Key Insight: " label) open the first paragraph.
 */
function richTextToChildren(
  html: string,
  ctx: RichTextContext,
  props: IParagraphOptions = {},
  lead: TextRun[] = []
): DocChild[] {
  if (!html.trim()) return lead.length ? [new Paragraph({ ...props, children: lead })] : [];
  if (!/<[^>]+>/.test(html)) return plainToParagraphs(html, props, lead);

  const out: DocChild[] = [];
  const pendingLead = [...lead];
  // Tables are parsed separately; split them out first.
  const parts = html.split(/(<table[\s\S]*?<\/table>)/i);
  for (const part of parts) {
    if (/^<table/i.test(part)) {
      if (pendingLead.length) out.push(new Paragraph({ ...props, children: pendingLead.splice(0) }));
      const table = htmlTableToDocx(part);
      if (table) out.push(table);
    } else {
      out.push(...inlineHtmlToParagraphs(part, ctx, props, pendingLead));
    }
  }
  if (pendingLead.length) out.unshift(new Paragraph({ ...props, children: pendingLead }));
  return out;
}

/** Consumes `lead` (emptying the array) into the first paragraph that has text. */
function inlineHtmlToParagraphs(
  html: string,
  ctx: RichTextContext,
  props: IParagraphOptions,
  lead: TextRun[]
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lists: { ordered: boolean; instance: number }[] = [];
  let runs: ParagraphChild[] = [];
  // Runs inside an <a> collect here, then become one hyperlink on </a>.
  let linkHref: string | null = null;
  let linkRuns: TextRun[] = [];
  let bold = 0;
  let italic = 0;
  let inListItem = false;

  const flush = () => {
    // A link left open at a paragraph break still keeps its text.
    if (linkHref && linkRuns.length) {
      runs.push(new ExternalHyperlink({ link: linkHref, children: linkRuns }));
      linkRuns = [];
    }
    if (runs.length === 0) return;
    const list = lists[lists.length - 1];
    const level = Math.min(lists.length - 1, 8);
    paragraphs.push(
      new Paragraph({
        ...props,
        children: runs,
        ...(inListItem && list
          ? list.ordered
            ? { numbering: { reference: NUMBERED, level, instance: list.instance } }
            : { bullet: { level } }
          : {}),
      })
    );
    runs = [];
  };

  const tokens = html.match(/<[^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      const text = decodeEntities(token.replace(/\s+/g, " "));
      if (!text.trim() && runs.length === 0) continue;
      if (runs.length === 0 && lead.length) runs.push(...lead.splice(0));
      if (linkHref) linkRuns.push(new TextRun({ text, bold: bold > 0, italics: italic > 0, style: "Hyperlink" }));
      else runs.push(new TextRun({ text, bold: bold > 0, italics: italic > 0 }));
      continue;
    }
    const m = token.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/);
    if (!m) continue;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    switch (tag) {
      case "a":
        if (closing) {
          if (linkHref && linkRuns.length) runs.push(new ExternalHyperlink({ link: linkHref, children: linkRuns }));
          linkHref = null;
          linkRuns = [];
        } else {
          const href = decodeEntities(token.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean) ?? "").trim();
          linkHref = /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
        }
        break;
      case "strong":
      case "b":
        bold += closing ? -1 : 1;
        break;
      case "em":
      case "i":
        italic += closing ? -1 : 1;
        break;
      case "br":
        runs.push(new TextRun({ text: "", break: 1 }));
        break;
      case "ul":
      case "ol":
        flush();
        if (closing) lists.pop();
        else lists.push({ ordered: tag === "ol", instance: ctx.nextListInstance() });
        break;
      case "li":
        flush();
        inListItem = !closing;
        break;
      case "p":
      case "div":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        flush();
        if (tag.startsWith("h")) bold += closing ? -1 : 1;
        break;
    }
    bold = Math.max(0, bold);
    italic = Math.max(0, italic);
  }
  flush();
  return paragraphs;
}

function htmlTableToDocx(html: string): Table | null {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const parsed = rows.map((row) =>
    (row.match(/<t([hd])[^>]*>([\s\S]*?)<\/t\1>/gi) ?? []).map((cell) => ({
      header: /^<th/i.test(cell),
      text: decodeEntities(
        cell
          .replace(/^<t[hd][^>]*>|<\/t[hd]>$/gi, "")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
          .replace(/<[^>]+>/g, "")
      ).trim(),
    }))
  );
  const columns = Math.max(0, ...parsed.map((r) => r.length));
  if (columns === 0) return null;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: parsed.map(
      (cells, rowIndex) =>
        new TableRow({
          tableHeader: (rowIndex === 0 && cells.every((c) => c.header)) || undefined,
          children: Array.from({ length: columns }, (_, i) => {
            const cell = cells[i];
            return new TableCell({
              shading: cell?.header ? { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } : undefined,
              children: (cell?.text ?? "").split("\n").map(
                (line) => new Paragraph({ children: [new TextRun({ text: line, bold: cell?.header })] })
              ),
            });
          }),
        })
    ),
  });
}

function simpleTable(rows: string[][], headerRow?: string[]): Table {
  const all = headerRow ? [headerRow, ...rows] : rows;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: all.map(
      (cells, r) =>
        new TableRow({
          tableHeader: (!!headerRow && r === 0) || undefined,
          children: cells.map(
            (text) =>
              new TableCell({
                shading:
                  headerRow && r === 0 ? { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } : undefined,
                children: [new Paragraph({ children: [new TextRun({ text, bold: !!headerRow && r === 0 })] })],
              })
          ),
        })
    ),
  });
}

/* ---------- Images ---------- */

type DocxImageType = "png" | "jpg" | "gif" | "bmp";

interface LoadedImage {
  data: Buffer;
  type: DocxImageType;
  width: number;
  height: number;
}

function imageInfo(buf: Buffer): { type: DocxImageType; width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { type: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
    return { type: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length > 26 && buf.toString("ascii", 0, 2) === "BM") {
    return { type: "bmp", width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      // SOF0-SOF15, excluding DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function loadImage(url: string): Promise<LoadedImage | null> {
  try {
    let buf: Buffer;
    const dataUrl = url.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (dataUrl) {
      buf = Buffer.from(dataUrl[1], "base64");
    } else if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      return null;
    }
    // WebP and SVG are not supported by Word's ImageRun; those fall back to a link.
    const info = imageInfo(buf);
    if (!info || info.width <= 0 || info.height <= 0) return null;
    return { data: buf, ...info };
  } catch {
    return null;
  }
}

function collectImageUrls(course: CourseForExport): string[] {
  const urls = new Set<string>();
  for (const mod of course.modules ?? [])
    for (const lesson of mod.lessons ?? [])
      for (const page of lesson.pages ?? [])
        for (const block of page.blocks ?? [])
          if (block.category === "content" && block.type === "image") {
            const url = str(block.data?.url).trim();
            if (url) urls.add(url);
          }
  return Array.from(urls);
}

/* ---------- Blocks ---------- */

function link(text: string, url: string): ExternalHyperlink {
  return new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: "Hyperlink" })] });
}

function labelled(label: string, children: ParagraphChild[], props: IParagraphOptions = {}): Paragraph {
  return new Paragraph({ ...props, children: [new TextRun({ text: `${label}: `, bold: true }), ...children] });
}

interface RenderContext extends RichTextContext {
  images: Map<string, LoadedImage>;
  accent: string;
  options: DocxExportOptions;
}

function calloutProps(accent: string, fill: string): IParagraphOptions {
  return {
    shading: { type: ShadingType.CLEAR, fill, color: "auto" },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 8 } },
    indent: { left: 240 },
  };
}

function renderContentBlock(block: BlockForExport, ctx: RenderContext, pageHeadingLevel: number): DocChild[] {
  const c = block.data ?? {};
  switch (block.type) {
    case "text":
      return richTextToChildren(str(c.text), ctx);
    case "heading": {
      const text = str(c.text).trim();
      if (!text) return [];
      // The importer reads H2/H3 as heading blocks; H3 is the template's section level.
      const level = Math.min(6, Math.max(1, Number(c.level) || 2));
      return [heading(text, Math.max(3, Math.min(6, pageHeadingLevel + level - 2)))];
    }
    case "image": {
      const url = str(c.url).trim();
      if (!url) return [];
      const alt = str(c.alt);
      const caption = str(c.caption).trim();
      const img = ctx.images.get(url);
      const out: DocChild[] = [];
      if (img) {
        const scale = Math.min(1, MAX_IMAGE_WIDTH / img.width);
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: img.type,
                data: img.data,
                transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
                altText: { name: alt || "Image", description: alt, title: alt },
              }),
            ],
          })
        );
      } else if (/^https?:\/\//i.test(url)) {
        out.push(labelled("Image", [link(alt || url, url)]));
      } else {
        out.push(new Paragraph({ children: [new TextRun({ text: `[Image${alt ? `: ${alt}` : ""}]`, italics: true })] }));
      }
      if (caption) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: caption, italics: true, color: "555555" })],
          })
        );
      }
      return out;
    }
    case "video_embed": {
      // A bare URL as the link text survives import; the importer turns YouTube URLs back into video blocks.
      const url = str(c.url).trim();
      if (!url) return [];
      return [new Paragraph({ children: [/^https?:\/\//i.test(url) ? link(url, url) : new TextRun(url)] })];
    }
    case "key_insight":
      return richTextToChildren(str(c.text), ctx, calloutProps(ctx.accent, "EEF2FF"), [
        new TextRun({ text: "Key Insight: ", bold: true }),
      ]);
    case "key_point": {
      const title = str(c.title).trim();
      const props = calloutProps("94A3B8", "F8FAFC");
      if (title) {
        return [
          new Paragraph({ ...props, children: [new TextRun({ text: `Key Point: ${title}`, bold: true })] }),
          ...richTextToChildren(str(c.text), ctx, props),
        ];
      }
      return richTextToChildren(str(c.text), ctx, props, [new TextRun({ text: "Key Point: ", bold: true })]);
    }
    case "table": {
      const table = htmlTableToDocx(str(c.html));
      return table ? [table, new Paragraph({})] : [];
    }
    case "file_download": {
      const url = str(c.url).trim();
      if (!/^https?:\/\//i.test(url)) return [];
      const filename = str(c.filename);
      const label = str(c.label).trim() || filename || "Download file";
      const description = str(c.description).trim();
      // The importer strips links, so the URL is also written out as text.
      return [
        labelled("Download", [link(label, url), new TextRun({ text: ` (${url})`, color: "555555" })]),
        ...(description ? [new Paragraph({ children: [new TextRun({ text: description, color: "555555" })] })] : []),
      ];
    }
  }
  return [];
}

/**
 * Interactions use the labels in the import template (scripts/generate-course-template.ts):
 * "Quiz:", "A) option (correct)", "Correct answer: C.", "True or False:", "Answer: True.",
 * "Reflection:", "Drag and Drop:" with "1." steps, "Match:", "Flashcards:" with "Front:"/"Back:".
 */
function renderInteractionBlock(block: BlockForExport, ctx: RenderContext): DocChild[] {
  const c = block.data ?? {};
  const { options } = ctx;
  const answers = !!options.includeAnswers;
  const explanation = str(c.explanation).trim();
  const explained = (label: string): Paragraph[] =>
    answers ? [labelled(label, explanation ? [new TextRun(explanation)] : [])] : [];
  const spacer = new Paragraph({});

  switch (block.type) {
    case "multiple_choice": {
      const opts = Array.isArray(c.options) ? c.options.map(String) : [];
      const correct = Number(c.correctIndex ?? 0);
      const letter = (i: number) => String.fromCharCode(65 + i);
      return [
        labelled("Quiz", [new TextRun(str(c.question))]),
        ...opts.map(
          (o, i) => new Paragraph({ text: `${letter(i)}) ${o}${answers && i === correct ? " (correct)" : ""}` })
        ),
        ...(answers
          ? [
              new Paragraph({
                children: [
                  new TextRun({ text: `Correct answer: ${letter(correct)}. `, bold: true }),
                  ...(explanation ? [new TextRun(explanation)] : []),
                ],
              }),
            ]
          : []),
        spacer,
      ];
    }
    case "true_false":
      return [
        labelled("True or False", [new TextRun(str(c.question))]),
        ...(answers
          ? [
              new Paragraph({
                children: [
                  new TextRun({ text: `Answer: ${c.correct === false ? "False" : "True"}. `, bold: true }),
                  ...(explanation ? [new TextRun(explanation)] : []),
                ],
              }),
            ]
          : []),
        spacer,
      ];
    case "reflection":
      return [
        labelled("Reflection", [new TextRun(str(c.prompt))]),
        // Space for a written response when printed.
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 1 } },
          spacing: { before: 720 },
        }),
        spacer,
      ];
    case "drag_and_drop": {
      // Items are stored in their correct order; without answers they are listed A-Z.
      const items = Array.isArray(c.items) ? c.items.map(String) : [];
      const shown = answers ? items : [...items].sort((a, b) => a.localeCompare(b));
      return [
        labelled("Drag and Drop", [new TextRun(str(c.question))]),
        ...shown.map((item, i) => new Paragraph({ text: `${i + 1}. ${item}` })),
        ...(explanation ? explained("Explanation") : []),
        spacer,
      ];
    }
    case "matching": {
      const pairs = (Array.isArray(c.pairs) ? c.pairs : []) as { left?: string; right?: string }[];
      const left = pairs.map((p) => String(p.left ?? ""));
      const right = pairs.map((p) => String(p.right ?? ""));
      const rightShown = answers ? right : [...right].sort((a, b) => a.localeCompare(b));
      return [
        labelled("Match", [new TextRun(str(c.question))]),
        simpleTable(
          left.map((l, i) => [l, rightShown[i] ?? ""]),
          answers ? ["Item", "Match"] : ["Item", "Options"]
        ),
        ...(explanation ? explained("Explanation") : []),
        spacer,
      ];
    }
    case "dialog_cards": {
      const cards = (Array.isArray(c.cards) ? c.cards : []) as { front?: string; back?: string }[];
      return [
        labelled("Flashcards", [new TextRun(str(c.title).trim())]),
        ...cards.flatMap((card) => [
          new Paragraph({ text: `Front: ${String(card.front ?? "")}` }),
          new Paragraph({ text: `Back: ${String(card.back ?? "")}` }),
        ]),
        spacer,
      ];
    }
  }
  return [];
}

/* ---------- Document ---------- */

export async function buildCourseDocx(
  course: CourseForExport & { overview?: string | null },
  options: DocxExportOptions = {}
): Promise<Buffer> {
  const brand = course.brandConfig ?? undefined;
  const accent = hexColour(brand?.primary) ?? "2563EB";
  const headingFont = str(brand?.headingFont) || undefined;
  const bodyFont = str(brand?.bodyFont) || str(brand?.font) || "Calibri";

  const urls = collectImageUrls(course);
  const loaded = await Promise.all(urls.map(loadImage));
  const images = new Map<string, LoadedImage>();
  loaded.forEach((img, i) => {
    if (img) images.set(urls[i], img);
  });

  let listInstance = 0;
  const ctx: RenderContext = { images, accent, options, nextListInstance: () => ++listInstance };

  const children: DocChild[] = [new Paragraph({ text: course.title, heading: HeadingLevel.TITLE })];
  if (course.overview?.trim()) {
    children.push(heading("Course Overview", 2), ...richTextToChildren(course.overview, ctx));
  }

  // Outline matches the import template: Module = H1, Lesson = H2, Page = H3.
  // A lesson or page whose title repeats its parent is not repeated.
  (course.modules ?? []).forEach((mod, modIndex) => {
    // The importer only splits sections on headings starting "Module N".
    const moduleTitle = /^Module\s+\d+/i.test(mod.title.trim())
      ? mod.title
      : `Module ${modIndex + 1}: ${mod.title}`;
    children.push(heading(moduleTitle, 1));
    for (const lesson of mod.lessons ?? []) {
      const lessonIsModule = lesson.title.trim() === mod.title.trim();
      if (!lessonIsModule) children.push(heading(lesson.title, 2));
      const lessonLevel = lessonIsModule ? 1 : 2;
      for (const page of lesson.pages ?? []) {
        const pageIsLesson = page.title.trim() === lesson.title.trim();
        if (!pageIsLesson) children.push(heading(page.title, lessonLevel + 1));
        const pageLevel = pageIsLesson ? lessonLevel : lessonLevel + 1;
        for (const block of page.blocks ?? []) {
          children.push(
            ...(block.category === "interaction"
              ? renderInteractionBlock(block, ctx)
              : renderContentBlock(block, ctx, pageLevel))
          );
        }
      }
    }
  });

  const doc = new Document({
    creator: "SCORM Course Builder",
    title: course.title,
    styles: {
      default: {
        document: { run: { font: bodyFont, size: 22 }, paragraph: { spacing: { after: 120 } } },
        title: { run: { font: headingFont, color: accent } },
        heading1: { run: { font: headingFont, color: accent }, paragraph: { spacing: { before: 360 } } },
        heading2: { run: { font: headingFont, color: accent } },
        heading3: { run: { font: headingFont } },
        heading4: { run: { font: headingFont } },
      },
    },
    numbering: {
      config: [
        {
          reference: NUMBERED,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        }
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
