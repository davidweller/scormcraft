# SCORM Course Builder SaaS — Product Requirements Document (PRD)

*This document is aligned with the current codebase (Next.js 14, Prisma, Vercel Blob, OpenAI + optional Gemini).*

## 1. Product Overview

**Working Name:** TBD\
**Category:** B2B SaaS — E-learning Authoring & SCORM Export\
**Primary Output:** LMS-ready SCORM 1.2 `.zip` packages (SCORM 2004 planned)

### Core Value Proposition

Enable instructional designers, universities, and training teams to
rapidly generate interactive, brand-aligned SCORM courses using
AI-assisted content creation and structured templates.

------------------------------------------------------------------------

## 2. Problem Statement

Current SCORM authoring tools:

-   Are expensive and desktop-bound\
-   Have steep learning curves\
-   Are slow for structured academic content\
-   Do not integrate well with AI workflows\
-   Are difficult to brand at scale

Institutions need:

-   Faster course production\
-   LMS-ready exports\
-   AI-assisted content drafting\
-   Brand consistency\
-   SCORM compliance without technical complexity

------------------------------------------------------------------------

## 3. Target Users

### Primary

-   Higher education professional services teams\
-   Academic developers\
-   Corporate L&D teams\
-   Independent course creators

### Secondary

-   Agencies building compliance courses\
-   EdTech startups

------------------------------------------------------------------------

## 4. Core Features (MVP)

### 4.1 Course Creation Engine

-   Course title, overview, audience, target word count, tone, compliance level\
-   Optional branding at creation (primary, secondary, accent, background, content background, fonts)\
-   Optional bring-your-own OpenAI API key\
-   **Course import:** Upload a `.docx` (Word) file; AI structures it into course → modules → lessons → pages and content/interaction blocks (optional path into the flow)\
-   Module and lesson builder (create, reorder, rename, delete)\
-   Page-based structure (screen-level authoring); content blocks: text, heading, image, video embed, key insight, key point, table

### 4.2 AI Content Generation

-   **Blueprint:** AI proposes course description, module titles, lesson titles per module, ILOs (learning outcomes), and assessment plan; user can edit inline and regenerate per section\
-   **Lesson pages:** AI generates content blocks (intro, core content, knowledge checks, summary) per lesson; user selects lesson(s) or “all”, then refines in the editor\
-   **Interactions:** AI generates knowledge checks per lesson; user configures enabled types (reflection, multiple choice, true/false, drag-and-drop, matching, dialog cards), density, placement, and whether to include explanations\
-   Regenerate per block (supported for interaction blocks)\
-   Tone and course context (audience, word count, compliance) drive generation

### 4.3 Interactive Components Library

Supported interactions (implemented): - **Multiple choice** (question, options, correct index, optional explanation)\
- **True/false** (question, correct boolean, optional explanation)\
- **Reflection** (open-ended prompt; non-graded)\
- **Drag-and-drop** (items in correct order)\
- **Matching** (left/right pairs)\
- **Dialog cards** (flip cards with front/back text)

### 4.4 Brand Customisation

-   Primary, secondary, accent, background, content background colours\
-   Logo upload (stored in blob storage)\
-   Heading and body font (e.g. Work Sans, Ubuntu)\
-   Design tokens applied across preview and SCORM export\
-   Preview mode (learner view and “as LMS” with SCORM API)

### 4.5 Media Integration

-   Image upload (Vercel Blob)\
-   AI image generation (Gemini; optional, style presets)\
-   Video embed (e.g. YouTube/Vimeo URLs in content)\
-   Media library with search and filter (upload vs AI-generated)

### 4.6 SCORM Export Engine (Critical)

-   **SCORM 1.2:** Implemented; produces LMS-ready `.zip` with valid `imsmanifest.xml`, JavaScript SCORM API wrapper, responsive HTML5, bundled images, bookmarking, score reporting, time tracking\
-   **SCORM 2004 (3rd ed):** Planned; not yet implemented\
-   Completion/scoring: default behaviour (complete/incomplete per SCO); further completion rules configurable in future

### 4.7 Testing & Validation

-   **Preview:** “Preview (Learner View)” and “Preview as LMS” (SCORM API) with page-by-page navigation\
-   **Review/validator:** Reading time (word count), ILO coverage, accessibility (image alt text, heading level hierarchy), broken link check\
-   SCORM package can be validated externally (e.g. SCORM Cloud)

------------------------------------------------------------------------

## 5. Advanced Features (Phase 2)

-   SCORM 2004 export\
-   xAPI export\
-   Multi-language generation\
-   Accessibility checker (WCAG 2.2; colour contrast, etc.) — partial checks (alt text, heading hierarchy) already in Review\
-   Version control\
-   Collaboration (comments + roles)\
-   Template marketplace\
-   LMS analytics connector\
-   Bulk course duplication / cross-institution cloning

------------------------------------------------------------------------

## 6. Technical Architecture

### Frontend

-   Next.js 14 (App Router) + React + TypeScript + Tailwind\
-   Block-based page editor (TipTap for rich text; drag-and-drop reorder via @dnd-kit)\
-   Course tree (modules → lessons → pages) with inline add/rename/delete

### Backend

-   Next.js API routes (REST)\
-   Prisma ORM; course data stored in PostgreSQL (e.g. Neon / Vercel Postgres)\
-   SCORM packaging in-app (`buildScorm12Zip`, manifest, API wrapper, HTML renderer)\
-   AI: OpenAI for blueprint, lesson content, and interactions (optional BYO key); Gemini for optional AI image generation

### Storage

-   Vercel Blob for uploads (images, logo) and generated media\
-   PostgreSQL for courses, modules, lessons, pages, blocks, media metadata

### SCORM Engine Layer

-   JavaScript SCORM API wrapper (1.2)\
-   Runtime event tracking (view, completion, score)\
-   Automatic manifest generator (imsmanifest.xml)\
-   Course-to-SCO mapping (one SCO per page); images fetched and bundled into package

------------------------------------------------------------------------

## 7. Data Model (High-Level)

Implemented via Prisma; high-level shape:

### Course

-   Metadata (title, overview, audience, targetWordCount, tone, complianceLevel)\
-   brandConfig (JSON: primary, secondary, accent, background, contentBg, logoUrl, headingFont, bodyFont, etc.)\
-   settings (e.g. apiKeys.openai for BYO key)\
-   ilos, assessmentPlan, interactionConfig (JSON)\
-   modules\[\]

### Module

-   title, order\
-   lessons\[\]

### Lesson

-   title, order\
-   pages\[\]

### Page

-   title, order, completionRules (JSON)\
-   blocks\[\] (unified; each block has category: "content" | "interaction", type, data, order)

### Block

-   category, type, data (JSON), order\
-   Content types: text, heading, image, video_embed, key_insight, key_point, table\
-   Interaction types: multiple_choice, true_false, reflection, drag_and_drop, matching, dialog_cards

### Media

-   url, filename, mimeType, size, width, height, alt, source (upload | ai_generated), prompt

------------------------------------------------------------------------

## 8. Compliance & Accessibility

-   Target: WCAG AA minimum\
-   Review validator checks: image alt text, heading level hierarchy (no skips)\
-   Full keyboard navigation, ARIA labels, caption support, and automated colour contrast checking are Phase 2 / ongoing improvements

------------------------------------------------------------------------

## 9. Monetisation Model

### Tier 1 -- Starter

-   Limited exports per month\
-   SCORM 1.2 only\
-   Basic branding

### Tier 2 -- Pro

-   Unlimited exports\
-   SCORM 2004\
-   Advanced interactions\
-   AI generation credits

### Tier 3 -- Enterprise

-   Team accounts\
-   White-label export\
-   Custom branding defaults\
-   LMS integration support\
-   Priority compliance validation

Optional: - Bring-your-own API keys\
- Per-export pricing\
- Template marketplace revenue share

------------------------------------------------------------------------

## 10. Success Metrics

-   Time to first SCORM export\
-   Course build completion rate\
-   Export-to-LMS success rate\
-   AI generation usage percentage\
-   Monthly exports per user\
-   90-day retention rate

------------------------------------------------------------------------

## 11. Competitive Positioning

Competes with: - Articulate Storyline\
- Adobe Captivate\
- iSpring Suite

Differentiation: - AI-native workflow\
- Fully web-based\
- Faster structured academic builds\
- Transparent pricing\
- Brand automation\
- Developer-friendly export logic

------------------------------------------------------------------------

## 12. Risks

-   SCORM edge-case compatibility\
-   LMS inconsistencies\
-   AI hallucination in assessments\
-   Accessibility compliance complexity\
-   Scope creep toward full LMS functionality

------------------------------------------------------------------------

## 13. MVP Definition (Strict Scope)

The MVP must: - Create structured courses (modules → lessons → pages → blocks)\
- Include at least three interaction types (implemented: multiple choice, true/false, reflection, drag-and-drop, matching, dialog cards)\
- Export valid SCORM 1.2 (LMS-ready .zip, imsmanifest.xml, API wrapper, completion/score)\
- Support branding (colours, logo, fonts)\
- Optional: course import from .docx, AI blueprint, AI-generated pages and interactions, preview as LMS, review/validation report

Anything beyond this (e.g. SCORM 2004, xAPI, collaboration) is post-MVP.

------------------------------------------------------------------------

## 14. MVP User Flow

The primary path is create → blueprint → generate content → (optional) generate interactions → review → export. An alternative path is import from Word (.docx) → blueprint (pre-filled) → refine → review → export.

### Step 1 — Create course (or import)

**Create:** Title, overview, audience, target word count, tone, compliance level, optional branding (colours, fonts), optional BYO OpenAI key.

**Import (alternative):** Upload a `.docx` file; AI parses and creates course with modules, lessons, pages, and content/interaction blocks. User is taken to blueprint to adjust structure and ILOs.

**Output:** New course; user is directed to Blueprint.

### Step 2 — Blueprint

**Inputs:** Course context (title, overview, audience, word count, tone, compliance). If imported, structure may already be filled.

**AI can propose:** Course description, module titles, lesson titles per module, ILOs, assessment plan. User edits inline and can regenerate per section.

**Output:** Apply blueprint creates/updates modules and lessons; user continues to Generate (lesson pages).

### Step 3 — Generate lesson pages

**Inputs:** Course and blueprint (modules, lessons, ILOs, tone).

**Per lesson:** AI generates pages and content blocks (intro, core content, knowledge checks, summary).

**User actions:** Select lesson(s) or "all", trigger generation, then refine in the page editor.

**Output:** Pages and content blocks; user may then run Generate interactions (Step 3b) or go to Edit/Review.

### Step 3b — Generate interactions (optional)

**Inputs:** Interaction config (enabled types, density, placement, include explanations). Run per lesson or in bulk.

**Output:** Interaction blocks added to pages; user refines in editor.

### Step 4 — Review

**Validator:** Reading time (word count), ILO coverage, accessibility (alt text, heading hierarchy), broken link check.

**User actions:** Review report, fix issues in editor via "Go to page" where needed.

**Output:** User proceeds to Export when ready.

### Step 5 — Export

**Inputs:** SCORM version (1.2 implemented; 2004 planned). Completion/scoring use default behaviour; LMS settings can be set in the LMS when importing.

**Output:** LMS-ready `.zip` with valid `imsmanifest.xml`, SCORM API wrapper, responsive HTML5; user downloads the package.

------------------------------------------------------------------------

## 15. Roadmap Phases

**Phase 1 (current):** Core builder (create, blueprint, generate pages, generate interactions), six interaction types, branding, media (upload + optional AI images), course import (.docx), review/validation, preview as LMS, SCORM 1.2 export. **Done.**\
**Phase 2:** SCORM 2004, collaboration (comments, roles), templates, bulk duplication\
**Phase 3:** xAPI, accessibility checker (e.g. WCAG colour contrast), enterprise controls\
**Phase 4:** Marketplace, API ecosystem
