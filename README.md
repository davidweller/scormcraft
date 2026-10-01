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

## MVP scope

Per PRD Section 13: structured courses, three interaction types (multiple choice, true/false, reflection), valid SCORM 1.2 export, completion/score tracking, branding, SCORM Cloud validation.
