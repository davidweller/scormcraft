# SCORM Course Builder

B2B SaaS for AI-assisted SCORM course authoring and export. See [SCORM_Course_Builder_SaaS_PRD.md](./SCORM_Course_Builder_SaaS_PRD.md) for product scope.

## Stack

- **App:** Next.js 14 (App Router) + TypeScript + Tailwind
- **DB:** PostgreSQL (Neon / Vercel Postgres) with Prisma
- **Storage:** Vercel Blob (optional; for uploads and later export zip)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set:

   - `DATABASE_URL` — PostgreSQL connection string (Neon or Vercel Postgres).
   - `BLOB_READ_WRITE_TOKEN` — Optional; required for file uploads and export zip (Vercel Blob).

3. **Database**

   ```bash
   npx prisma db push
   # Optional: seed a sample course
   npm run db:seed
   ```

4. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Use **Courses** to list/create courses; click a course then **Edit course** to open the course builder (sidebar tree + block-based page editor).

## API (Phase 1)

- `GET/POST /api/courses` — List, create courses.
- `GET/PATCH/DELETE /api/courses/[courseId]` — Course CRUD; GET returns full tree (modules → lessons → pages → content blocks, interaction blocks).
- Nested create/update/delete:
  - `POST .../modules`, `PATCH/DELETE .../modules/[moduleId]`
  - `POST .../lessons`, `PATCH/DELETE .../lessons/[lessonId]`
  - `POST .../pages`, `PATCH/DELETE .../pages/[pageId]`
  - `POST .../pages/[pageId]/content-blocks`, `PATCH/DELETE .../content-blocks/[blockId]`
  - `POST .../pages/[pageId]/interaction-blocks`, `PATCH/DELETE .../interaction-blocks/[blockId]`
- `POST /api/uploads` — FormData with `file`; returns `{ url }`. Requires `BLOB_READ_WRITE_TOKEN`.

## Starting a course

`/courses/new` offers three ways in:

- **Create with AI**: describe the course, then `/courses/[id]/build` drafts learning outcomes, modules and lessons. You edit and approve the outline, choose whether to add interactions, and the lessons are written one at a time. Nothing is written before the outline is approved, and lessons that already have content are skipped.
- **Import a course**: a Word or Markdown document, or a package exported from SCORMcraft. Imports open in the editor with their content as written.
- **Start blank**: an empty course, opened in the editor.

## Protecting content

- Saving the blueprint updates modules and lessons in place. Only ones removed from the blueprint are deleted, after a confirmation.
- Lesson generation writes into empty lessons only. Regenerating a lesson that has content asks first, and replaces its text and headings but keeps images, tables, files and interactions.
- "Rewrite with AI" on a block shows the new version beside the current one, with Replace, Insert below and Discard.
- **History** (`/courses/[id]/history`): a version of the course is saved before a lesson is regenerated, before a module, lesson or page is deleted, and before a blueprint save that removes lessons. Any of the newest 25 can be restored. This uses the `CourseSnapshot` table: the desktop app adds it at startup; the web database needs `npm run db:push` once.

## Course builder (Phase 2)

- **Edit course** (`/courses/[id]/edit`): The outline shows the course structure (modules → lessons → pages). Add, rename, duplicate, delete and reorder modules, lessons and pages, by dragging or from each row's menu. Click a page to edit.
- **Blocks**: drag a block by its handle, or use Move up and Move down in its menu. The + between two blocks adds one at that position.
- **Look and feel**: colours, fonts and the UI kit are described in `src/app/globals.css` and `src/components/ui/`. Use the `brand`, `gray` and `surface` colours rather than `bg-white` or raw `blue-*`, so the dark theme keeps working.
- **Page editor**: Edit page title; add and edit **content blocks** (text, heading, image, video embed, table, file download) and **interaction blocks** (multiple choice, true/false, reflection). Changes save on blur.
- **File downloads**: attach .docx, .xlsx, .pptx, .pdf or .csv files that are bundled into the SCORM package. See [docs/file-downloads.md](./docs/file-downloads.md).

## Windows desktop app

The same app runs as a standalone Windows program, fully local: courses in a SQLite file and uploads on disk under `%APPDATA%\SCORMcraft\data`. No Neon, no Vercel Blob.

| Command | What it does |
|---|---|
| `npm run desktop:dev` | Runs the app in an Electron window on port 3417 with local data in `.desktop-data/` (beside a normal `npm run dev`) |
| `npm run desktop:build:win` | Builds `dist/SCORMcraft Setup <version>.exe` (about 5 minutes) |
| `npm run db:migrate:desktop -- --name <change>` | After changing `prisma/schema.prisma`, creates the matching SQLite migration in `prisma/sqlite/migrations/`; the app applies it on next start |
| `npx tsx scripts/neon-to-local.ts [--dry-run]` | Copies every course and Blob file from Neon into the desktop data folder. Read-only on Neon; safe to re-run. Close the app first |

How it fits together:

- `prisma/schema.prisma` stays the source of truth. `scripts/make-sqlite-schema.ts` derives the SQLite schema; its client is generated into `src/generated/prisma-sqlite`, and `src/lib/db.ts` picks a client from `DATABASE_URL` (`file:` means SQLite).
- `STORAGE_DIR` switches `src/lib/blob.ts` to local files served at `/files/...`. Server code reads stored files with `fetchStored`, not `fetch`.
- `electron/main.js` starts the standalone Next server with the environment from `electron/env.js`. Server logs go to `%APPDATA%\SCORMcraft\logs\server.log`.

### AI providers

Settings (home page, then Settings) picks the provider; a course can override it in its own settings.

| Provider | Needs |
|---|---|
| Claude subscription | [Claude Code](https://claude.com/claude-code) installed and signed in with a Pro/Max plan. Desktop only |
| ChatGPT subscription | Codex CLI (`npm install -g @openai/codex`) signed in with a ChatGPT plan. Desktop only |
| OpenAI API | An OpenAI key |
| Anthropic API | An Anthropic key (default model `claude-opus-5-5`) |

The subscription providers run the official CLI on your machine (`src/lib/llm/claude-cli.ts`, `codex-cli.ts`), so usage counts against your plan. They are for your own use, not for the hosted web version. Image generation still needs a Gemini key.

## MVP scope

Per PRD Section 13: structured courses, three interaction types (multiple choice, true/false, reflection), valid SCORM 1.2 export, completion/score tracking, branding, SCORM Cloud validation.
