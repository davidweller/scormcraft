# Changelog

Notable changes to SCORMcraft, newest first.

## Unreleased

### Fixed

- A malformed reply from the AI is retried once instead of failing the lesson.

### Changed

- The README and guides are rewritten, and the original product documents moved to `docs/archive`.

## 1.1.0 (26 November 2026)

SCORMcraft is now a desktop app only. The hosted web version is retired.

### Changed

- Courses are stored in SQLite only, and uploads on disk only. The Postgres and cloud storage code is gone.
- Claude and ChatGPT subscription sign-in, editable settings and local uploads are always available.
- `npm run dev` starts the desktop app. `npm run db:migrate` writes migrations against a scratch database.

### Fixed

- The build stages in the sidebar now update when an AI build finishes.

### Removed

- The Vercel deployment config, the Blob upload route and the web-only maintenance scripts.

## 1.0.0 (26 November 2026)

A rework of how the app looks, flows and protects your work.

### Added

- A start screen with three paths: Create with AI, Import a course, Start blank.
- A staged AI build: draft an outline, approve it, choose options, then build lesson by lesson with progress and a stop button.
- Course history: a version is saved before anything destructive, and any of the newest 25 can be restored.
- Reordering for modules, lessons and pages in the outline, including moving a lesson to another module.
- Reordering for options, items, pairs and cards inside interactions.
- An inline + between blocks, block menus with Move up, Move down and Move to top, and breadcrumbs in the editor.
- "Rewrite with AI" shows the new version beside the current one, with Replace, Insert below and Discard.
- Three learner layouts, a dark theme, and desktop, tablet and phone preview widths.
- An export readiness list, with links to fix each issue.
- A warning before leaving a page with unsaved changes.

### Changed

- Saving the blueprint updates modules and lessons in place, and only deletes what you removed.
- AI generation writes into empty lessons only, unless you confirm otherwise, and keeps images, tables, files and interactions.
- Imported documents open in the editor, and imported courses are no longer steered towards generation.
- One design system: shared buttons, dialogs, forms and toasts, one icon set, one brand colour.

### Fixed

- Blocks no longer stretch or squash while being dragged.
- Saving the blueprint after an import no longer deletes the imported content.
- JPEG and WebP logos are exported with the right file type.

## 0.1.0

The first desktop build.
