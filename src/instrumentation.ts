/**
 * Next.js startup hook. On the desktop build (SQLite), bring the local
 * database up to date before the first request is served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!(process.env.DATABASE_URL ?? "").startsWith("file:")) return;

  const { join } = await import("node:path");
  const { applyDesktopMigrations } = await import("@/lib/desktop/migrate");
  const dir = process.env.MIGRATIONS_DIR || join(process.cwd(), "prisma", "sqlite", "migrations");
  await applyDesktopMigrations(dir);
}
