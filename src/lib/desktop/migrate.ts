/**
 * Apply the bundled SQLite migrations to the desktop database at startup.
 *
 * The packaged app has no Prisma CLI, so `prisma migrate deploy` is not an
 * option. Prisma's migration files are plain SQL, so this applies each
 * unapplied `migrations/<name>/migration.sql` in name order inside a
 * transaction and records it in `_desktop_migrations`.
 *
 * A database created by `prisma migrate dev` (desktop:dev before this runner
 * existed) already has `_prisma_migrations`; those entries count as applied.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma as defaultClient } from "@/lib/db";

type Raw = Pick<typeof defaultClient, "$queryRawUnsafe" | "$executeRawUnsafe" | "$transaction">;

export function splitSql(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function tableExists(prisma: Raw, name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    name
  );
  return rows.length > 0;
}

/** `client` defaults to the app's; scripts/neon-to-local.ts passes its own SQLite client. */
export async function applyDesktopMigrations(
  migrationsDir: string,
  prisma: Raw = defaultClient
): Promise<string[]> {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations folder not found: ${migrationsDir}`);
  }

  await prisma.$executeRawUnsafe(
    "CREATE TABLE IF NOT EXISTS _desktop_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );

  const applied = new Set(
    (await prisma.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM _desktop_migrations")).map(
      (r) => r.name
    )
  );
  if (await tableExists(prisma, "_prisma_migrations")) {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL"
    );
    for (const r of rows) applied.add(r.migration_name);
  }

  const pending = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(migrationsDir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort()
    .filter((name) => !applied.has(name));

  for (const name of pending) {
    const statements = splitSql(readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"));
    await prisma.$transaction([
      ...statements.map((s) => prisma.$executeRawUnsafe(s)),
      prisma.$executeRawUnsafe(
        "INSERT INTO _desktop_migrations (name, applied_at) VALUES (?, ?)",
        name,
        new Date().toISOString()
      ),
    ]);
    console.log(`[desktop] applied migration ${name}`);
  }
  return pending;
}
