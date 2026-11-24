/**
 * Derive the desktop (SQLite) Prisma schema from the Postgres one.
 *
 * prisma/schema.prisma stays the single source of truth for models. The
 * desktop build only swaps the datasource provider, so the two can't drift.
 * Output: prisma/sqlite/schema.prisma (gitignored, regenerated every build).
 * Its client is generated to src/generated/prisma-sqlite so it sits beside the
 * Postgres client instead of overwriting it; src/lib/db.ts picks one at runtime.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");

const datasource = /datasource\s+db\s*\{[^}]*\}/;
const generator = /generator\s+client\s*\{[^}]*\}/;
if (!generator.test(src)) throw new Error("No `generator client` block in prisma/schema.prisma");
if (!datasource.test(src)) throw new Error("No `datasource db` block in prisma/schema.prisma");
if (/@db\./.test(src)) {
  throw new Error("Native @db.* types have no SQLite equivalent; remove them or map them here.");
}

const out =
  "// GENERATED from prisma/schema.prisma by scripts/make-sqlite-schema.ts. Do not edit.\n" +
  src
    .replace(datasource, 'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}')
    .replace(
      generator,
      'generator client {\n  provider = "prisma-client-js"\n  output   = "../../src/generated/prisma-sqlite"\n}'
    );

mkdirSync(join(root, "prisma", "sqlite"), { recursive: true });
writeFileSync(join(root, "prisma", "sqlite", "schema.prisma"), out);
console.log("Wrote prisma/sqlite/schema.prisma");
