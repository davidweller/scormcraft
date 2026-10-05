/**
 * Render course page and blocks to static HTML for SCORM export.
 */

import type { BrandConfig } from "@/types/branding";
import { DEFAULT_BRAND_CONFIG } from "@/types/branding";
import { formatFileSize, getDocumentTypeByMime } from "@/lib/document-files";

export interface Block {
  id: string;
  category: "content" | "interaction";
  type: string;
  data: Record<string, unknown>;
  order: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br />");
}

/**
 * Sanitize rich text HTML to allow only safe tags for display.
 * Allows: p, strong, em, b, i, ul, ol, li, br
 * Strips all other tags and attributes.
 */
function sanitizeRichText(html: string): string {
  if (!html) return "";
  
  // If the content doesn't contain any HTML tags, treat it as plain text
  if (!/<[^>]+>/.test(html)) {
    return nl2br(html);
  }
  
  // Define allowed tags (no attributes allowed for security)
  const allowedTags = new Set(["p", "strong", "em", "b", "i", "ul", "ol", "li", "br", "table", "thead", "tbody", "tr", "th", "td"]);
  
  // Process HTML by parsing tags
  let result = "";
  let i = 0;
  
  while (i < html.length) {
    if (html[i] === "<") {
      // Find the end of the tag
      const tagEnd = html.indexOf(">", i);
      if (tagEnd === -1) {
        // No closing bracket, escape and continue
        result += escapeHtml(html[i]);
        i++;
        continue;
      }
      
      const tagContent = html.slice(i + 1, tagEnd);
      const isClosing = tagContent.startsWith("/");
      const tagNameMatch = tagContent.match(/^\/?([a-zA-Z][a-zA-Z0-9]*)/);
      
      if (tagNameMatch) {
        const tagName = tagNameMatch[1].toLowerCase();
        if (allowedTags.has(tagName)) {
          // Output the allowed tag (stripped of attributes)
          if (isClosing) {
            result += `</${tagName}>`;
          } else if (tagName === "br") {
            result += "<br />";
          } else {
            result += `<${tagName}>`;
          }
        }
        // Skip disallowed tags entirely
      }
      
      i = tagEnd + 1;
    } else {
      // Regular character - escape it
      result += escapeHtml(html[i]);
      i++;
    }
  }
  
  return result;
}

export function renderContentBlock(block: Block): string {
  const c = block.data || {};
  if (block.type === "text") {
    const text = typeof c.text === "string" ? c.text : "";
    return `<div class="content-text reveal">${sanitizeRichText(text)}</div>`;
  }
  if (block.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(c.level) || 2));
    const text = typeof c.text === "string" ? c.text : "";
    return `<h${level} class="content-heading reveal">${escapeHtml(text)}</h${level}>`;
  }
  if (block.type === "image") {
    const url = typeof c.url === "string" ? c.url : "";
    const alt = typeof c.alt === "string" ? c.alt : "";
    const caption = typeof c.caption === "string" ? c.caption.trim() : "";
    if (!url) return "";
    const figcaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
    return `<figure class="content-image reveal"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />${figcaption}</figure>`;
  }
  if (block.type === "video_embed") {
    const url = typeof c.url === "string" ? c.url : "";
    if (!url) return "";
    const mimeType = typeof c.mimeType === "string" ? c.mimeType : "";
    const sourceType = typeof c.sourceType === "string" ? c.sourceType : "";
    const isLocalPath = !/^https?:\/\//i.test(url);
    const looksLikeMp4 = /\.mp4($|\?)/i.test(url) || mimeType === "video/mp4" || sourceType === "upload";
    if (isLocalPath || looksLikeMp4) {
      return `<div class="content-video reveal"><video controls preload="metadata"><source src="${escapeHtml(url)}" type="video/mp4" />Your browser does not support the video tag.</video></div>`;
    }
    const embed = url.includes("youtube") || url.includes("youtu.be")
      ? url.replace(/youtu\.be\/([^?]+)/, "youtube.com/embed/$1").replace(/watch\?v=([^&]+)/, "embed/$1")
      : url;
    return `<div class="content-video reveal"><iframe src="${escapeHtml(embed)}" title="Embedded video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
  }
  if (block.type === "key_insight") {
    const text = typeof c.text === "string" ? c.text : "";
    return `<div class="key-insight reveal">${sanitizeRichText(text)}</div>`;
  }
  if (block.type === "key_point") {
    const text = typeof c.text === "string" ? c.text : "";
    const title = typeof c.title === "string" ? c.title : "";
    const titleHtml = title ? `<p class="content-card-title">${escapeHtml(title)}</p>` : "";
    return `<div class="content-card reveal">${titleHtml}<div class="content-card-body">${sanitizeRichText(text)}</div></div>`;
  }
  if (block.type === "table") {
    const html = typeof c.html === "string" ? c.html : "";
    if (!html) return "";
    return `<div class="content-table reveal">${sanitizeRichText(html)}</div>`;
  }
  if (block.type === "file_download") {
    const url = typeof c.url === "string" ? c.url.trim() : "";
    // Packaged files are relative paths; preview uses the https Blob URL. Anything else (javascript: etc.) is dropped.
    if (!url || (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:\/\//i.test(url))) return "";
    const filename = typeof c.filename === "string" ? c.filename : "";
    const label = typeof c.label === "string" && c.label.trim() ? c.label.trim() : filename || "Download file";
    const description = typeof c.description === "string" ? c.description.trim() : "";
    const typeLabel = getDocumentTypeByMime(typeof c.mimeType === "string" ? c.mimeType : "")?.label;
    const meta = [typeLabel, formatFileSize(Number(c.size) || 0)].filter(Boolean).join(" · ");
    const icon = `<svg class="content-download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
    return `<a class="content-download reveal" href="${escapeHtml(url)}" download="${escapeHtml(filename)}">${icon}<span class="content-download-text"><span class="content-download-label">${escapeHtml(label)}</span>${description ? `<span class="content-download-desc">${escapeHtml(description)}</span>` : ""}${meta ? `<span class="content-download-meta">${escapeHtml(meta)}</span>` : ""}</span></a>`;
  }
  return "";
}

/** Grading key for one block: used by runtime script to compute score. */
export interface GradingKey {
  blockId: string;
  type: "multiple_choice" | "true_false" | "drag_and_drop" | "matching";
  correctIndex?: number;
  correct?: boolean;
  correctOrder?: number[];
  pairCount?: number;
}

export function renderInteractionBlock(
  block: Block,
  gradingKey?: GradingKey | null
): string {
  const cfg = block.data || {};
  const dataAttrs =
    gradingKey && (gradingKey.type === "multiple_choice" || gradingKey.type === "true_false")
      ? gradingKey.type === "multiple_choice"
        ? ` data-scorm-graded="true" data-block-id="${escapeHtml(block.id)}" data-correct-index="${Number(gradingKey.correctIndex ?? 0)}"`
        : ` data-scorm-graded="true" data-block-id="${escapeHtml(block.id)}" data-correct="${gradingKey.correct === true ? "true" : "false"}"`
      : "";
  if (block.type === "reflection") {
    const prompt = typeof cfg.prompt === "string" ? cfg.prompt : "";
    return `<div class="interaction reflection reveal"><p class="prompt">${nl2br(prompt)}</p><textarea class="reflection-input" rows="4" placeholder="Your response..."></textarea></div>`;
  }
  if (block.type === "multiple_choice") {
    const question = typeof cfg.question === "string" ? cfg.question : "";
    const options = Array.isArray(cfg.options) ? cfg.options : [];
    const explanation = typeof cfg.explanation === "string" ? cfg.explanation : "";
    const explanationAttr = explanation ? ` data-explanation="${escapeHtml(explanation)}"` : "";
    const opts = options.map((o, i) => `<li class="option-item" data-index="${i}"><label><input type="radio" name="mc-${block.id}" value="${i}" /> ${escapeHtml(String(o))}</label></li>`).join("");
    return `<div class="interaction multiple-choice reveal"${dataAttrs}${explanationAttr}><p class="question">${nl2br(question)}</p><ul class="options">${opts}</ul><button type="button" class="check-answer-btn">Check Answer</button><div class="feedback hidden"></div></div>`;
  }
  if (block.type === "true_false") {
    const question = typeof cfg.question === "string" ? cfg.question : "";
    const explanation = typeof cfg.explanation === "string" ? cfg.explanation : "";
    const explanationAttr = explanation ? ` data-explanation="${escapeHtml(explanation)}"` : "";
    return `<div class="interaction true-false reveal"${dataAttrs}${explanationAttr}><p class="question">${nl2br(question)}</p><ul class="options"><li class="option-item" data-value="true"><label><input type="radio" name="tf-${block.id}" value="true" /> True</label></li><li class="option-item" data-value="false"><label><input type="radio" name="tf-${block.id}" value="false" /> False</label></li></ul><button type="button" class="check-answer-btn">Check Answer</button><div class="feedback hidden"></div></div>`;
  }
  if (block.type === "drag_and_drop") {
    const question = typeof cfg.question === "string" ? cfg.question : "";
    const items = Array.isArray(cfg.items) ? cfg.items : [];
    const correctOrder = Array.isArray(cfg.correctOrder) ? cfg.correctOrder : items.map((_, i) => i);
    const explanation = typeof cfg.explanation === "string" ? cfg.explanation : "";
    const explanationAttr = explanation ? ` data-explanation="${escapeHtml(explanation)}"` : "";
    const correctOrderAttr = ` data-correct-order="${escapeHtml(JSON.stringify(correctOrder))}"`;
    const dragDataAttrs = gradingKey && gradingKey.type === "drag_and_drop"
      ? ` data-scorm-graded="true" data-block-id="${escapeHtml(block.id)}"${correctOrderAttr}`
      : correctOrderAttr;
    const itemsHtml = items.map((item, i) => 
      `<li class="drag-item" draggable="true" data-index="${i}"><span class="drag-handle">⠿</span><span class="drag-content">${escapeHtml(String(item))}</span></li>`
    ).join("");
    return `<div class="interaction drag-and-drop reveal"${dragDataAttrs}${explanationAttr}><p class="question">${nl2br(question)}</p><p class="drag-instruction">Drag items to reorder them correctly.</p><ul class="drag-list">${itemsHtml}</ul><button type="button" class="check-answer-btn">Check Order</button><div class="feedback hidden"></div></div>`;
  }
  if (block.type === "matching") {
    const question = typeof cfg.question === "string" ? cfg.question : "";
    const pairs = Array.isArray(cfg.pairs) ? cfg.pairs : [];
    const explanation = typeof cfg.explanation === "string" ? cfg.explanation : "";
    const explanationAttr = explanation ? ` data-explanation="${escapeHtml(explanation)}"` : "";
    const pairsJson = JSON.stringify(pairs.map((p, i) => ({ left: i, right: i })));
    const matchDataAttrs = gradingKey && gradingKey.type === "matching"
      ? ` data-scorm-graded="true" data-block-id="${escapeHtml(block.id)}" data-pair-count="${pairs.length}"`
      : ` data-pair-count="${pairs.length}"`;
    const shuffledRight = [...pairs].sort(() => Math.random() - 0.5);
    const rightIndexMap = shuffledRight.map(p => pairs.indexOf(p));
    const leftHtml = pairs.map((p, i) => 
      `<li class="match-item match-left" data-index="${i}">${escapeHtml(String((p as { left: string }).left || ""))}</li>`
    ).join("");
    const rightHtml = shuffledRight.map((p, i) => 
      `<li class="match-item match-right" data-index="${rightIndexMap[i]}">${escapeHtml(String((p as { right: string }).right || ""))}</li>`
    ).join("");
    return `<div class="interaction matching reveal"${matchDataAttrs}${explanationAttr}><p class="question">${nl2br(question)}</p><p class="match-instruction">Click an item on the left, then click its match on the right.</p><div class="match-container"><ul class="match-column match-left-col">${leftHtml}</ul><svg class="match-lines" aria-hidden="true"></svg><ul class="match-column match-right-col">${rightHtml}</ul></div><button type="button" class="check-answer-btn">Check Matches</button><div class="feedback hidden"></div></div>`;
  }
  if (block.type === "dialog_cards") {
    const title = typeof cfg.title === "string" ? cfg.title : "";
    const cards = Array.isArray(cfg.cards) ? cfg.cards : [];
    const titleHtml = title ? `<p class="dialog-cards-title">${escapeHtml(title)}</p>` : "";
    const cardsHtml = cards.map((card, i) => {
      const front = (card as { front: string }).front || "";
      const back = (card as { back: string }).back || "";
      return `<div class="dialog-card${i === 0 ? " active" : ""}" data-index="${i}"><div class="card-inner"><div class="card-front"><p>${nl2br(front)}</p><span class="flip-hint">Click to flip</span></div><div class="card-back"><p>${nl2br(back)}</p></div></div></div>`;
    }).join("");
    const dotsHtml = cards.length > 1 
      ? `<div class="card-dots">${cards.map((_, i) => `<button class="card-dot${i === 0 ? " active" : ""}" data-index="${i}" aria-label="Card ${i + 1}"></button>`).join("")}</div>`
      : "";
    const navHtml = cards.length > 1
      ? `<div class="card-nav"><button class="card-prev" disabled aria-label="Previous card">←</button><span class="card-counter">1 / ${cards.length}</span><button class="card-next" aria-label="Next card">→</button></div>`
      : "";
    return `<div class="interaction dialog-cards reveal" data-total-cards="${cards.length}">${titleHtml}<div class="cards-viewport">${cardsHtml}</div>${dotsHtml}${navHtml}</div>`;
  }
  return "";
}

function mergeWithDefaults(config?: BrandConfig | null): BrandConfig {
  if (!config) return DEFAULT_BRAND_CONFIG;
  return { ...DEFAULT_BRAND_CONFIG, ...config };
}

function buildBrandCss(brandConfig?: BrandConfig | null, logoPath?: string): string {
  const c = mergeWithDefaults(brandConfig);
  const vars: string[] = [];
  if (c.primary) vars.push(`--brand-primary: ${c.primary}`);
  if (c.primaryButtonFill) vars.push(`--brand-primary-fill: ${c.primaryButtonFill}`);
  if (c.primaryButtonText) vars.push(`--brand-primary-text: ${c.primaryButtonText}`);
  if (c.primaryButtonHover) vars.push(`--brand-primary-hover: ${c.primaryButtonHover}`);
  if (c.secondary) vars.push(`--brand-secondary: ${c.secondary}`);
  if (c.secondaryButtonColor) vars.push(`--brand-secondary-color: ${c.secondaryButtonColor}`);
  if (c.secondaryButtonBg) vars.push(`--brand-secondary-bg: ${c.secondaryButtonBg}`);
  if (c.accent) vars.push(`--brand-accent: ${c.accent}`);
  if (c.ctaFill) vars.push(`--brand-cta-fill: ${c.ctaFill}`);
  if (c.ctaText) vars.push(`--brand-cta-text: ${c.ctaText}`);
  if (c.background) vars.push(`--brand-background: ${c.background}`);
  if (c.contentBg) vars.push(`--brand-content-bg: ${c.contentBg}`);
  if (c.cardBg) vars.push(`--brand-card-bg: ${c.cardBg}`);
  if (c.linkColor) vars.push(`--brand-link: ${c.linkColor}`);
  if (vars.length === 0 && !logoPath) return "";
  let css = ":root { " + vars.join("; ") + " }\n";
  if (c.background) css += "body { background: var(--brand-background); }\n";
  if (c.linkColor) css += "a { color: var(--brand-link); }\n";
  if (c.linkColor) css += "a:hover { color: var(--brand-primary-hover, var(--brand-primary)); text-decoration: underline; }\n";
  if (c.cardBg) css += ".interaction { background: var(--brand-card-bg); }\n";
  css += ".page-nav a { text-decoration: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; }\n";
  if (c.primaryButtonFill) css += ".page-nav a[href]:not(.secondary) { background: var(--brand-primary-fill); color: var(--brand-primary-text); }\n";
  if (c.primaryButtonHover) css += ".page-nav a[href]:not(.secondary):hover { background: var(--brand-primary-hover); color: var(--brand-primary-text); }\n";
  if (c.secondaryButtonColor) css += ".page-nav a.secondary { background: var(--brand-secondary-bg); color: var(--brand-secondary-color); border: 2px solid var(--brand-secondary-color); }\n";
  if (c.secondaryButtonColor) css += ".page-nav a.secondary:hover { filter: brightness(0.96); }\n";
  return css;
}

function buildFontLinks(brandConfig?: BrandConfig | null): string {
  const c = mergeWithDefaults(brandConfig);
  const heading = (c.headingFont || c.font || "").trim();
  const body = (c.bodyFont || c.font || "").trim();
  const families: string[] = [];
  if (heading) families.push(`family=${heading.replace(/\s+/g, "+")}:wght@400;600;700`);
  if (body && body !== heading) families.push(`family=${body.replace(/\s+/g, "+")}:wght@400;600;700`);
  if (families.length === 0) return "";
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families.join("&")}&display=swap" />`;
}

export interface ScormRuntimeOptions {
  pageIndex: number;
  totalPages: number;
  totalScoreMax: number;
  gradingKeysByBlockId: Record<string, GradingKey>;
}

export function renderPageHtml(options: {
  pageTitle: string;
  blocks: Block[];
  courseTitle: string;
  prevHref?: string;
  nextHref?: string;
  scormApiPath?: string;
  brandConfig?: BrandConfig | null;
  logoPath?: string;
  scormRuntime?: ScormRuntimeOptions;
  moduleIndex?: number;
  moduleTitle?: string;
  lessonIndex?: number;
  lessonTitle?: string;
}): string {
  const {
    pageTitle,
    blocks,
    courseTitle,
    prevHref,
    nextHref,
    scormApiPath = "scorm-api.js",
    brandConfig,
    logoPath,
    scormRuntime,
    moduleIndex,
    moduleTitle,
    lessonIndex,
    lessonTitle,
  } = options;
  
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
  const blocksHtml = sortedBlocks
    .map((block) => {
      if (block.category === "content") {
        return renderContentBlock(block);
      } else {
        return renderInteractionBlock(block, scormRuntime?.gradingKeysByBlockId[block.id]);
      }
    })
    .filter(Boolean)
    .join("\n");
  const nav =
    prevHref || nextHref
      ? `<nav class="page-nav"><div>${prevHref ? `<a href="${escapeHtml(prevHref)}" class="secondary">← Previous</a>` : ""}</div><div>${nextHref ? `<a href="${escapeHtml(nextHref)}">Next →</a>` : ""}</div></nav>`
      : "";
  const fontLink = buildFontLinks(brandConfig);
  const brandCss = buildBrandCss(brandConfig, logoPath);
  const c = mergeWithDefaults(brandConfig);
  const bodyFont = (c.bodyFont || c.font || "").trim();
  const headingFont = (c.headingFont || c.font || "").trim();
  const bodyFontFamily = bodyFont ? `'${String(bodyFont).replace(/'/g, "\\'")}', system-ui, sans-serif` : "system-ui, sans-serif";
  const headingFontFamily = headingFont ? `'${String(headingFont).replace(/'/g, "\\'")}', system-ui, sans-serif` : "inherit";
  const logoHtml =
    logoPath ?
      `<header class="course-header"><img src="${escapeHtml(logoPath)}" alt="Logo" class="course-logo" /></header>`
    : "";
  const bodyDataAttrs = buildScormBodyDataAttrs(scormRuntime);

  const progressBarHtml =
    scormRuntime && scormRuntime.totalPages > 0
      ? (() => {
          const currentPage = scormRuntime.pageIndex + 1;
          const totalPages = scormRuntime.totalPages;
          const progressPercent = Math.round((currentPage / totalPages) * 100);
          return `<div class="progress-container">
      <span class="progress-label">Page ${currentPage} of ${totalPages}</span>
      <div class="progress-bar" role="progressbar" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
      </div>
    </div>`;
        })()
      : "";

  const breadcrumbTitle = lessonIndex !== undefined && lessonTitle ? lessonTitle.trim() : "";
  const microLabelHtml =
    moduleIndex !== undefined && moduleTitle && breadcrumbTitle
      ? `<p class="micro-label">${escapeHtml(breadcrumbTitle)}</p>`
      : "";

  const pageIndex = scormRuntime?.pageIndex ?? 0;
  const sectionNumber = String(pageIndex + 1).padStart(2, "0");
  const sectionAnchorHtml = `<span class="section-number" aria-hidden="true">${sectionNumber}</span>`;

  const bodyContent = `
  <div class="course-wrapper">
    ${logoHtml}
    ${progressBarHtml}
    <main class="course-main">
      ${microLabelHtml}
      <div class="section-heading-wrap">
        ${sectionAnchorHtml}
        <h1>${escapeHtml(pageTitle)}</h1>
      </div>
      <div class="blocks">${blocksHtml}</div>
      ${nav}
    </main>
  </div>
  <script src="${escapeHtml(scormApiPath)}"></script>
  <script>
${buildScormRuntimeScript(scormRuntime)}
  </script>
  <script>
(function() {
  var reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  reveals.forEach(function(el) { observer.observe(el); });
})();
  </script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>${escapeHtml(pageTitle)} - ${escapeHtml(courseTitle)}</title>
  ${fontLink}
  <style>
    :root { --muted: #6b7280; }
    body { font-family: ${bodyFontFamily}; font-size: 1.05rem; line-height: 1.65; margin: 0; padding: 0; color: #1a1a1a; }
    .course-wrapper { max-width: 780px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    .course-main { background: var(--brand-content-bg, #f7f8fa); border-top: 4px solid var(--brand-accent, #ff7700); padding: 3rem 2rem; margin-top: 0; border-radius: 0 0 12px 12px; }
    .progress-container { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .progress-label { font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
    .progress-bar { flex: 1; height: 6px; background: rgba(0,0,0,0.08); border-radius: 3px; overflow: hidden; }
    .progress-bar-fill { height: 100%; background: var(--brand-accent, #ff7700); border-radius: 3px; transition: width 0.3s ease; }
    .course-header { margin-bottom: 2rem; }
    .course-logo { max-height: 48px; width: auto; }
    .micro-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin: 0 0 0.25rem 0; }
    .section-heading-wrap { position: relative; margin-bottom: 3rem; }
    .section-number { position: absolute; left: 0; top: -0.2em; font-size: 4rem; font-weight: 700; opacity: 0.03; line-height: 1; pointer-events: none; }
    h1, h2, h3, h4, h5, h6, .content-heading { font-family: ${headingFontFamily}; }
    h1 { font-size: 2.25rem; font-weight: 700; margin: 0 0 0.5em 0; }
    h2 { font-size: 1.65rem; font-weight: 600; margin: 2rem 0 0.5em 0; }
    h3 { font-size: 1.2rem; font-weight: 500; margin: 1.5rem 0 0.35em 0; }
    .content-text { margin: 1.2em 0; }
    .content-text p { margin: 0 0 1.2em 0; }
    .content-text p:last-child { margin-bottom: 0; }
    .content-text ul, .content-text ol { margin: 1em 0; padding-left: 1.5em; }
    .content-text li { margin: 0.25em 0; }
    .content-text strong, .content-text b { font-weight: 600; }
    .content-text em, .content-text i { font-style: italic; }
    .content-heading { margin: 2rem 0 0.5em 0; }
    .content-heading:first-of-type { margin-top: 0; }
    .content-image { margin: 3rem 0; }
    .content-image img { max-width: 100%; height: auto; border-radius: 8px; }
    .content-image figcaption { margin-top: 0.6em; font-style: italic; font-size: 0.95rem; opacity: 0.8; white-space: pre-line; }
    .content-video { margin: 3rem 0; }
    .content-video iframe, .content-video video { width: 100%; aspect-ratio: 16/9; border-radius: 8px; }
    .key-insight { margin: 3rem 0; padding: 1.5rem 1.5rem 1.5rem 1.75rem; border-left: 4px solid var(--brand-accent, #ff7700); background: rgba(0,0,0,0.02); font-size: 1.1rem; line-height: 1.65; border-radius: 0 8px 8px 0; }
    .key-insight p { margin: 0; }
    .key-insight ul, .key-insight ol { margin: 0.5em 0; padding-left: 1.25em; }
    .key-insight li { margin: 0.2em 0; }
    .content-card { margin: 3rem 0; padding: 24px 32px; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
    .content-card-title { font-weight: 600; font-size: 1.1rem; margin: 0 0 0.75em 0; }
    .content-card-body { margin: 0; }
    .content-card-body ul, .content-card-body ol { margin: 0.5em 0; padding-left: 1.25em; }
    .content-card-body li { margin: 0.2em 0; }
    .content-download { display: flex; align-items: center; gap: 16px; margin: 2rem 0; padding: 16px 20px; background: var(--brand-card-bg, #ffffff); border: 1px solid #e5e7eb; border-radius: 12px; color: inherit; text-decoration: none; transition: border-color 0.15s, box-shadow 0.15s; }
    .content-download:hover, .content-download:focus-visible { border-color: var(--brand-accent, #ff7700); box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
    .content-download-icon { flex-shrink: 0; width: 28px; height: 28px; color: var(--brand-accent, #ff7700); }
    .content-download-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .content-download-label { font-weight: 600; }
    .content-download-desc { font-size: 0.95rem; }
    .content-download-meta { font-size: 0.85rem; opacity: 0.65; }
    .content-table { margin: 2rem 0; overflow-x: auto; }
    .content-table table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
    .content-table th, .content-table td { padding: 0.75rem 1rem; border: 1px solid #e5e7eb; text-align: left; }
    .content-table th { background: #f9fafb; font-weight: 600; }
    .content-table tr:nth-child(even) td { background: #fafafa; }
    .interaction { margin: 4rem 0; padding: 24px 32px; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
    .interaction .question, .interaction .prompt { margin: 0 0 1rem 0; font-weight: 500; }
    .interaction .options { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .interaction .option-item { margin: 0; }
    .interaction .option-item label { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-radius: 8px; border: 2px solid #e5e7eb; cursor: pointer; transition: border-color 0.15s ease, background-color 0.15s ease; }
    .interaction .option-item label:hover { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.04); }
    .interaction .option-item:has(input:checked) label { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.08); }
    .interaction .option-item label:focus-within { border-color: var(--brand-accent, #ff7700); }
    .interaction .reflection-input { width: 100%; box-sizing: border-box; padding: 0.75rem; border-radius: 8px; border: 2px solid #e5e7eb; font-family: inherit; font-size: 1rem; resize: vertical; transition: border-color 0.15s ease; }
    .interaction .reflection-input:focus { outline: none; border-color: var(--brand-accent, #ff7700); }
    .page-nav { display: flex; justify-content: space-between; margin-top: 4rem; padding-top: 2rem; border-top: 1px solid rgba(0,0,0,0.08); }
    .page-nav a { text-decoration: none; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; transition: background-color 0.15s ease, color 0.15s ease; }
    .reveal { opacity: 0; transition: opacity 0.25s ease; }
    .reveal.visible { opacity: 1; }
    .check-answer-btn { display: block; margin-top: 1.25rem; padding: 0.625rem 1.5rem; background: var(--brand-primary-fill, var(--brand-accent, #ff7700)); color: var(--brand-primary-text, #fff); border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background-color 0.15s ease, opacity 0.15s ease; }
    .check-answer-btn:hover:not(:disabled) { background: var(--brand-primary-hover, #e66a00); }
    .check-answer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .feedback { margin-top: 1rem; padding: 1rem 1.25rem; border-radius: 8px; font-size: 0.95rem; line-height: 1.5; }
    .feedback.hidden { display: none; }
    .feedback.correct { background: #ecfdf5; border: 1px solid #10b981; color: #065f46; }
    .feedback.incorrect { background: #fef2f2; border: 1px solid #ef4444; color: #991b1b; }
    .feedback .feedback-title { font-weight: 600; margin: 0 0 0.25rem 0; }
    .feedback .feedback-explanation { margin: 0.5rem 0 0 0; font-size: 0.9rem; opacity: 0.9; }
    .interaction.checked .option-item label { cursor: default; }
    .interaction.checked .option-item label:hover { border-color: #e5e7eb; background: transparent; }
    .interaction.checked .option-item:has(input:checked) label:hover { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.08); }
    .interaction.checked .option-item.correct-answer label { border-color: #10b981; background: rgba(16,185,129,0.08); }
    .interaction.checked .option-item.user-incorrect label { border-color: #ef4444; background: rgba(239,68,68,0.08); }
    
    /* Drag and Drop Styles */
    .drag-instruction, .match-instruction { font-size: 0.9rem; color: var(--muted, #6b7280); margin: 0 0 1rem 0; }
    .drag-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .drag-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; cursor: grab; transition: border-color 0.15s ease, background-color 0.15s ease, transform 0.15s ease; user-select: none; }
    .drag-item:hover { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.04); }
    .drag-item.dragging { opacity: 0.5; transform: scale(1.02); border-color: var(--brand-accent, #ff7700); }
    .drag-item.drag-over { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.08); }
    .drag-handle { color: var(--muted, #6b7280); font-size: 1.2rem; line-height: 1; cursor: grab; }
    .drag-content { flex: 1; }
    .interaction.drag-and-drop.checked .drag-item { cursor: default; }
    .interaction.drag-and-drop.checked .drag-item.correct-position { border-color: #10b981; background: rgba(16,185,129,0.08); }
    .interaction.drag-and-drop.checked .drag-item.incorrect-position { border-color: #ef4444; background: rgba(239,68,68,0.08); }
    
    /* Matching Styles */
    .match-container { display: flex; align-items: flex-start; gap: 1rem; position: relative; }
    .match-column { list-style: none; margin: 0; padding: 0; flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }
    .match-item { padding: 0.75rem 1rem; background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; cursor: pointer; transition: border-color 0.15s ease, background-color 0.15s ease; text-align: center; }
    .match-item:hover { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.04); }
    .match-item.selected { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.12); }
    .match-item.matched { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.08); cursor: default; }
    .match-lines { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; }
    .match-lines line { stroke: var(--brand-accent, #ff7700); stroke-width: 2; }
    .interaction.matching.checked .match-item { cursor: default; }
    .interaction.matching.checked .match-item.correct-match { border-color: #10b981; background: rgba(16,185,129,0.08); }
    .interaction.matching.checked .match-item.incorrect-match { border-color: #ef4444; background: rgba(239,68,68,0.08); }
    .interaction.matching.checked .match-lines line.correct { stroke: #10b981; }
    .interaction.matching.checked .match-lines line.incorrect { stroke: #ef4444; }
    
    /* Dialog Cards Styles */
    .dialog-cards-title { font-weight: 600; margin: 0 0 1rem 0; }
    .cards-viewport { position: relative; min-height: 200px; perspective: 1000px; }
    .dialog-card { position: absolute; width: 100%; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; }
    .dialog-card.active { position: relative; opacity: 1; pointer-events: auto; }
    .card-inner { position: relative; width: 100%; min-height: 180px; transition: transform 0.5s ease; transform-style: preserve-3d; cursor: pointer; }
    .dialog-card.flipped .card-inner { transform: rotateY(180deg); }
    .card-front, .card-back { position: absolute; width: 100%; min-height: 180px; backface-visibility: hidden; border-radius: 12px; padding: 1.5rem; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
    .card-front { background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 2px solid #e5e7eb; }
    .card-back { background: linear-gradient(135deg, var(--brand-accent, #ff7700) 0%, #e66a00 100%); color: white; transform: rotateY(180deg); }
    .card-front p, .card-back p { margin: 0; font-size: 1.1rem; line-height: 1.5; }
    .flip-hint { font-size: 0.8rem; color: var(--muted, #6b7280); margin-top: 1rem; }
    .dialog-card.flipped .flip-hint { display: none; }
    .card-nav { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem; }
    .card-nav button { background: #f3f4f6; border: 2px solid #e5e7eb; border-radius: 8px; padding: 0.5rem 1rem; cursor: pointer; font-size: 1rem; transition: border-color 0.15s ease, background-color 0.15s ease; }
    .card-nav button:hover:not(:disabled) { border-color: var(--brand-accent, #ff7700); background: rgba(255,119,0,0.04); }
    .card-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
    .card-counter { font-size: 0.9rem; color: var(--muted, #6b7280); min-width: 50px; text-align: center; }
    .card-dots { display: flex; justify-content: center; gap: 0.5rem; margin-top: 1rem; }
    .card-dot { width: 10px; height: 10px; border-radius: 50%; background: #e5e7eb; border: none; cursor: pointer; padding: 0; transition: background-color 0.15s ease; }
    .card-dot:hover { background: #d1d5db; }
    .card-dot.active { background: var(--brand-accent, #ff7700); }
    
    ${brandCss}
    .page-nav a { border-radius: 8px; }
  </style>
</head>
<body${bodyDataAttrs}>${bodyContent}
</body>
</html>`;
}

function buildScormBodyDataAttrs(runtime?: ScormRuntimeOptions): string {
  if (!runtime || runtime.totalPages <= 0) return "";
  return ` data-scorm-page-index="${runtime.pageIndex}" data-scorm-total-pages="${runtime.totalPages}" data-scorm-total-max="${Math.max(1, runtime.totalScoreMax)}"`;
}

function buildCheckAnswerScript(): string {
  return `
(function() {
  function initCheckAnswers() {
    var interactions = document.querySelectorAll('.interaction.multiple-choice, .interaction.true-false');
    [].forEach.call(interactions, function(el) {
      var btn = el.querySelector('.check-answer-btn');
      var feedback = el.querySelector('.feedback');
      if (!btn || !feedback) return;
      
      btn.addEventListener('click', function() {
        var selected = el.querySelector('input[type="radio"]:checked');
        if (!selected) {
          feedback.className = 'feedback incorrect';
          feedback.innerHTML = '<p class="feedback-title">Please select an answer first.</p>';
          return;
        }
        
        var isMultipleChoice = el.classList.contains('multiple-choice');
        var correctIdx = el.getAttribute('data-correct-index');
        var correctVal = el.getAttribute('data-correct');
        var explanation = el.getAttribute('data-explanation') || '';
        var selectedValue = selected.value;
        var isCorrect;
        
        if (isMultipleChoice) {
          isCorrect = parseInt(selectedValue, 10) === parseInt(correctIdx, 10);
        } else {
          isCorrect = selectedValue === correctVal;
        }
        
        el.classList.add('checked');
        btn.disabled = true;
        var inputs = el.querySelectorAll('input[type="radio"]');
        [].forEach.call(inputs, function(inp) { inp.disabled = true; });
        
        var titleText = isCorrect ? 'Correct!' : 'Incorrect';
        var explanationHtml = explanation ? '<p class="feedback-explanation">' + explanation + '</p>' : '';
        feedback.className = 'feedback ' + (isCorrect ? 'correct' : 'incorrect');
        feedback.innerHTML = '<p class="feedback-title">' + titleText + '</p>' + explanationHtml;
        
        if (isMultipleChoice) {
          var optionItems = el.querySelectorAll('.option-item');
          [].forEach.call(optionItems, function(item) {
            var idx = item.getAttribute('data-index');
            if (parseInt(idx, 10) === parseInt(correctIdx, 10)) {
              item.classList.add('correct-answer');
            }
            var itemInput = item.querySelector('input[type="radio"]');
            if (itemInput && itemInput.checked && !isCorrect) {
              item.classList.add('user-incorrect');
            }
          });
        } else {
          var optionItems = el.querySelectorAll('.option-item');
          [].forEach.call(optionItems, function(item) {
            var val = item.getAttribute('data-value');
            if (val === correctVal) {
              item.classList.add('correct-answer');
            }
            var itemInput = item.querySelector('input[type="radio"]');
            if (itemInput && itemInput.checked && !isCorrect) {
              item.classList.add('user-incorrect');
            }
          });
        }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCheckAnswers);
  else initCheckAnswers();
})();

// Drag and Drop Interaction
(function() {
  function initDragAndDrop() {
    var dragDrops = document.querySelectorAll('.interaction.drag-and-drop');
    [].forEach.call(dragDrops, function(el) {
      var dragList = el.querySelector('.drag-list');
      var btn = el.querySelector('.check-answer-btn');
      var feedback = el.querySelector('.feedback');
      if (!dragList || !btn || !feedback) return;
      
      // Shuffle on load, re-rolling until the start order isn't already the answer
      var correctForShuffle;
      try { correctForShuffle = JSON.parse(el.getAttribute('data-correct-order') || '[]'); } catch(err) { correctForShuffle = []; }
      var shuffled = Array.prototype.slice.call(dragList.querySelectorAll('.drag-item'));
      for (var attempt = 0; attempt < 10 && shuffled.length > 1; attempt++) {
        for (var s = shuffled.length - 1; s > 0; s--) {
          var r = Math.floor(Math.random() * (s + 1));
          var tmp = shuffled[s]; shuffled[s] = shuffled[r]; shuffled[r] = tmp;
        }
        var solved = correctForShuffle.length === shuffled.length && shuffled.every(function(item, i) {
          return parseInt(item.getAttribute('data-index'), 10) === correctForShuffle[i];
        });
        if (!solved) break;
      }
      shuffled.forEach(function(item) { dragList.appendChild(item); });

      var draggedItem = null;
      var items = dragList.querySelectorAll('.drag-item');

      [].forEach.call(items, function(item) {
        item.addEventListener('dragstart', function(e) {
          draggedItem = this;
          this.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        
        item.addEventListener('dragend', function() {
          this.classList.remove('dragging');
          draggedItem = null;
          [].forEach.call(items, function(i) { i.classList.remove('drag-over'); });
        });
        
        item.addEventListener('dragover', function(e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (this !== draggedItem) this.classList.add('drag-over');
        });
        
        item.addEventListener('dragleave', function() {
          this.classList.remove('drag-over');
        });
        
        item.addEventListener('drop', function(e) {
          e.preventDefault();
          this.classList.remove('drag-over');
          if (draggedItem && this !== draggedItem) {
            var allItems = Array.prototype.slice.call(dragList.querySelectorAll('.drag-item'));
            var draggedIdx = allItems.indexOf(draggedItem);
            var targetIdx = allItems.indexOf(this);
            if (draggedIdx < targetIdx) {
              dragList.insertBefore(draggedItem, this.nextSibling);
            } else {
              dragList.insertBefore(draggedItem, this);
            }
          }
        });
        
        // Touch support
        var touchY = 0;
        item.addEventListener('touchstart', function(e) {
          touchY = e.touches[0].clientY;
          draggedItem = this;
          this.classList.add('dragging');
        }, {passive: true});
        
        item.addEventListener('touchmove', function(e) {
          e.preventDefault();
          var y = e.touches[0].clientY;
          var target = document.elementFromPoint(e.touches[0].clientX, y);
          if (target) {
            var closest = target.closest('.drag-item');
            [].forEach.call(items, function(i) { i.classList.remove('drag-over'); });
            if (closest && closest !== draggedItem) closest.classList.add('drag-over');
          }
        });
        
        item.addEventListener('touchend', function() {
          this.classList.remove('dragging');
          var overItem = dragList.querySelector('.drag-item.drag-over');
          if (overItem && draggedItem) {
            var allItems = Array.prototype.slice.call(dragList.querySelectorAll('.drag-item'));
            var draggedIdx = allItems.indexOf(draggedItem);
            var targetIdx = allItems.indexOf(overItem);
            if (draggedIdx < targetIdx) {
              dragList.insertBefore(draggedItem, overItem.nextSibling);
            } else {
              dragList.insertBefore(draggedItem, overItem);
            }
          }
          [].forEach.call(items, function(i) { i.classList.remove('drag-over'); });
          draggedItem = null;
        });
      });
      
      btn.addEventListener('click', function() {
        var correctOrderStr = el.getAttribute('data-correct-order');
        var explanation = el.getAttribute('data-explanation') || '';
        var correctOrder;
        try { correctOrder = JSON.parse(correctOrderStr); } catch(err) { correctOrder = []; }
        
        var currentItems = dragList.querySelectorAll('.drag-item');
        var currentOrder = Array.prototype.slice.call(currentItems).map(function(item) {
          return parseInt(item.getAttribute('data-index'), 10);
        });
        
        var isCorrect = correctOrder.length === currentOrder.length && 
          correctOrder.every(function(v, i) { return v === currentOrder[i]; });
        
        el.classList.add('checked');
        btn.disabled = true;
        
        [].forEach.call(currentItems, function(item, idx) {
          item.setAttribute('draggable', 'false');
          var itemIndex = parseInt(item.getAttribute('data-index'), 10);
          if (correctOrder[idx] === itemIndex) {
            item.classList.add('correct-position');
          } else {
            item.classList.add('incorrect-position');
          }
        });
        
        var titleText = isCorrect ? 'Correct!' : 'Incorrect - The items are not in the right order.';
        var explanationHtml = explanation ? '<p class="feedback-explanation">' + explanation + '</p>' : '';
        feedback.className = 'feedback ' + (isCorrect ? 'correct' : 'incorrect');
        feedback.innerHTML = '<p class="feedback-title">' + titleText + '</p>' + explanationHtml;
        
        if (typeof window.trackInteractionAnswer === 'function') {
          window.trackInteractionAnswer(el.getAttribute('data-block-id'), isCorrect);
        }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDragAndDrop);
  else initDragAndDrop();
})();

// Matching Interaction
(function() {
  function initMatching() {
    var matchings = document.querySelectorAll('.interaction.matching');
    [].forEach.call(matchings, function(el) {
      var leftCol = el.querySelector('.match-left-col');
      var rightCol = el.querySelector('.match-right-col');
      var svg = el.querySelector('.match-lines');
      var btn = el.querySelector('.check-answer-btn');
      var feedback = el.querySelector('.feedback');
      if (!leftCol || !rightCol || !btn || !feedback) return;
      
      var selectedLeft = null;
      var matches = {};
      var pairCount = parseInt(el.getAttribute('data-pair-count') || '0', 10);
      
      function updateLines() {
        if (!svg) return;
        var container = el.querySelector('.match-container');
        var containerRect = container.getBoundingClientRect();
        svg.innerHTML = '';
        svg.setAttribute('width', containerRect.width);
        svg.setAttribute('height', containerRect.height);
        
        for (var leftIdx in matches) {
          var rightIdx = matches[leftIdx];
          var leftItem = leftCol.querySelector('[data-index="' + leftIdx + '"]');
          var rightItem = rightCol.querySelector('[data-index="' + rightIdx + '"]');
          if (leftItem && rightItem) {
            var leftRect = leftItem.getBoundingClientRect();
            var rightRect = rightItem.getBoundingClientRect();
            var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', leftRect.right - containerRect.left);
            line.setAttribute('y1', leftRect.top + leftRect.height/2 - containerRect.top);
            line.setAttribute('x2', rightRect.left - containerRect.left);
            line.setAttribute('y2', rightRect.top + rightRect.height/2 - containerRect.top);
            line.setAttribute('data-left', leftIdx);
            line.setAttribute('data-right', rightIdx);
            svg.appendChild(line);
          }
        }
      }
      
      var leftItems = leftCol.querySelectorAll('.match-item');
      var rightItems = rightCol.querySelectorAll('.match-item');
      
      [].forEach.call(leftItems, function(item) {
        item.addEventListener('click', function() {
          if (el.classList.contains('checked')) return;
          var idx = this.getAttribute('data-index');
          if (matches[idx] !== undefined) {
            var oldRight = matches[idx];
            delete matches[idx];
            this.classList.remove('matched');
            var rightMatch = rightCol.querySelector('[data-index="' + oldRight + '"]');
            if (rightMatch) rightMatch.classList.remove('matched');
            updateLines();
          }
          [].forEach.call(leftItems, function(i) { i.classList.remove('selected'); });
          this.classList.add('selected');
          selectedLeft = idx;
        });
      });
      
      [].forEach.call(rightItems, function(item) {
        item.addEventListener('click', function() {
          if (el.classList.contains('checked')) return;
          if (selectedLeft === null) return;
          var rightIdx = this.getAttribute('data-index');
          
          for (var k in matches) {
            if (matches[k] === rightIdx) {
              delete matches[k];
              var oldLeft = leftCol.querySelector('[data-index="' + k + '"]');
              if (oldLeft) oldLeft.classList.remove('matched');
            }
          }
          
          matches[selectedLeft] = rightIdx;
          var leftItem = leftCol.querySelector('[data-index="' + selectedLeft + '"]');
          if (leftItem) {
            leftItem.classList.remove('selected');
            leftItem.classList.add('matched');
          }
          this.classList.add('matched');
          selectedLeft = null;
          updateLines();
        });
      });
      
      btn.addEventListener('click', function() {
        var explanation = el.getAttribute('data-explanation') || '';
        var correctCount = 0;
        
        for (var leftIdx in matches) {
          if (matches[leftIdx] === leftIdx) correctCount++;
        }
        
        var isCorrect = correctCount === pairCount && Object.keys(matches).length === pairCount;
        
        el.classList.add('checked');
        btn.disabled = true;
        
        for (var leftIdx in matches) {
          var rightIdx = matches[leftIdx];
          var leftItem = leftCol.querySelector('[data-index="' + leftIdx + '"]');
          var rightItem = rightCol.querySelector('[data-index="' + rightIdx + '"]');
          var line = svg ? svg.querySelector('line[data-left="' + leftIdx + '"]') : null;
          
          if (leftIdx === rightIdx) {
            if (leftItem) leftItem.classList.add('correct-match');
            if (rightItem) rightItem.classList.add('correct-match');
            if (line) line.classList.add('correct');
          } else {
            if (leftItem) leftItem.classList.add('incorrect-match');
            if (rightItem) rightItem.classList.add('incorrect-match');
            if (line) line.classList.add('incorrect');
          }
        }
        
        var titleText = isCorrect ? 'Correct!' : 'Incorrect - Some matches are wrong.';
        var explanationHtml = explanation ? '<p class="feedback-explanation">' + explanation + '</p>' : '';
        feedback.className = 'feedback ' + (isCorrect ? 'correct' : 'incorrect');
        feedback.innerHTML = '<p class="feedback-title">' + titleText + '</p>' + explanationHtml;
        
        if (typeof window.trackInteractionAnswer === 'function') {
          window.trackInteractionAnswer(el.getAttribute('data-block-id'), isCorrect);
        }
      });
      
      window.addEventListener('resize', updateLines);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMatching);
  else initMatching();
})();

// Dialog Cards Interaction
(function() {
  function initDialogCards() {
    var cardSets = document.querySelectorAll('.interaction.dialog-cards');
    [].forEach.call(cardSets, function(el) {
      var cards = el.querySelectorAll('.dialog-card');
      var dots = el.querySelectorAll('.card-dot');
      var prevBtn = el.querySelector('.card-prev');
      var nextBtn = el.querySelector('.card-next');
      var counter = el.querySelector('.card-counter');
      var totalCards = parseInt(el.getAttribute('data-total-cards') || '1', 10);
      var currentIndex = 0;
      
      function showCard(idx) {
        currentIndex = Math.max(0, Math.min(idx, totalCards - 1));
        [].forEach.call(cards, function(card, i) {
          card.classList.toggle('active', i === currentIndex);
          card.classList.remove('flipped');
        });
        [].forEach.call(dots, function(dot, i) {
          dot.classList.toggle('active', i === currentIndex);
        });
        if (counter) counter.textContent = (currentIndex + 1) + ' / ' + totalCards;
        if (prevBtn) prevBtn.disabled = currentIndex === 0;
        if (nextBtn) nextBtn.disabled = currentIndex === totalCards - 1;
      }
      
      [].forEach.call(cards, function(card) {
        card.addEventListener('click', function() {
          this.classList.toggle('flipped');
        });
      });
      
      [].forEach.call(dots, function(dot) {
        dot.addEventListener('click', function() {
          showCard(parseInt(this.getAttribute('data-index'), 10));
        });
      });
      
      if (prevBtn) prevBtn.addEventListener('click', function() { showCard(currentIndex - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function() { showCard(currentIndex + 1); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDialogCards);
  else initDialogCards();
})();`;
}

function buildScormRuntimeScript(runtime?: ScormRuntimeOptions): string {
  const checkAnswerScript = buildCheckAnswerScript();
  if (!runtime || runtime.totalPages <= 0) {
    return `if (typeof SCORM !== 'undefined') { SCORM.init(); SCORM.setLessonStatus('incomplete'); }
    window.addEventListener('beforeunload', function() { if (typeof SCORM !== 'undefined') SCORM.setLessonStatus('completed'); });
    ${checkAnswerScript}`;
  }
  return `(function() {
  var body = document.body;
  var pageIndex = parseInt(body.getAttribute('data-scorm-page-index') || '0', 10);
  var totalPages = parseInt(body.getAttribute('data-scorm-total-pages') || '1', 10);
  var totalScoreMax = Math.max(1, parseInt(body.getAttribute('data-scorm-total-max') || '1', 10));
  function initScorm() {
    if (typeof SCORM === 'undefined') return;
    SCORM.init();
    SCORM.setLessonStatus('incomplete');
    var sd = SCORM.getSuspendData();
    var state = { viewed: [], score: 0, answers: {} };
    try { if (sd) state = JSON.parse(sd); } catch (e) {}
    if (!state.viewed) state.viewed = [];
    if (state.viewed.indexOf(pageIndex) === -1) state.viewed.push(pageIndex);
    state.viewed = state.viewed.filter(function(v, i, a) { return a.indexOf(v) === i; });
    if (!state.answers) state.answers = {};
    SCORM.setSuspendData(JSON.stringify(state));
    SCORM.setScore(state.score || 0, 0, totalScoreMax);
    var graded = document.querySelectorAll('[data-scorm-graded="true"]');
    [].forEach.call(graded, function(el) {
      var inputs = el.querySelectorAll('input[type="radio"]');
      var correctVal = el.getAttribute('data-correct');
      var correctIdx = el.getAttribute('data-correct-index');
      var isCorrect = correctVal !== null && correctVal !== ''
        ? function(v) { return v === correctVal; }
        : function(v) { return parseInt(v, 10) === parseInt(correctIdx, 10); };
      [].forEach.call(inputs, function(inp) {
        inp.addEventListener('change', function() {
          if (typeof SCORM === 'undefined') return;
          var sd2 = SCORM.getSuspendData();
          var s2 = { viewed: state.viewed, score: 0, answers: state.answers || {} };
          try { if (sd2) s2 = JSON.parse(sd2); } catch (e) {}
          var key = el.getAttribute('data-block-id');
          s2.answers[key] = isCorrect(this.value);
          var n = 0;
          for (var k in s2.answers) if (s2.answers[k]) n++;
          s2.score = n;
          state.score = n;
          state.answers = s2.answers;
          SCORM.setSuspendData(JSON.stringify(s2));
          SCORM.setScore(n, 0, totalScoreMax);
        });
      });
    });
    window.addEventListener('beforeunload', function() { SCORM.setLessonStatus('completed'); });
    
    // Global function to track answers from drag-and-drop and matching interactions
    window.trackInteractionAnswer = function(blockId, isCorrect) {
      if (typeof SCORM === 'undefined' || !blockId) return;
      var sd2 = SCORM.getSuspendData();
      var s2 = { viewed: state.viewed, score: 0, answers: state.answers || {} };
      try { if (sd2) s2 = JSON.parse(sd2); } catch (err) {}
      s2.answers[blockId] = isCorrect;
      var n = 0;
      for (var k in s2.answers) if (s2.answers[k]) n++;
      s2.score = n;
      state.score = n;
      state.answers = s2.answers;
      SCORM.setSuspendData(JSON.stringify(s2));
      SCORM.setScore(n, 0, totalScoreMax);
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initScorm);
  else initScorm();
})();
${checkAnswerScript}`;
}
