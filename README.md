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

## Course builder (Phase 2)

- **Edit course** (`/courses/[id]/edit`): Sidebar shows course structure (modules → lessons → pages). Add/rename/delete modules, lessons, and pages. Click a page to edit.
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
