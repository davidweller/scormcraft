/**
 * Test environment guard.
 *
 * Vite loads the project's .env files, which on a developer machine hold a live
 * Vercel Blob token and a live database URL. Without this, a test that
 * exercises asset ingestion would upload to real storage and write real Media
 * rows.
 *
 * Deleting them is not enough: importing @prisma/client runs dotenv, which puts
 * every .env variable back into process.env, and that happens part-way through
 * an import chain — before src/lib/blob.ts reads the token at module load, but
 * after any test hook could have cleared it.
 *
 * So they are set to "" rather than deleted. dotenv does not overwrite a key
 * that already exists, so the empty value survives, and every consumer here
 * treats an empty credential as absent.
 *
 * A test that genuinely needs one of these must set it explicitly with
 * vi.stubEnv and point it at a test double.
 */

import { beforeEach } from "vitest";

const CLEARED = [
  "BLOB_READ_WRITE_TOKEN",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
] as const;

function clearLiveCredentials(): void {
  for (const key of CLEARED) process.env[key] = "";
}

clearLiveCredentials();
beforeEach(clearLiveCredentials);
