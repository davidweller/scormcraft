import { join } from "node:path";
import { isSqlite } from "@/lib/db";
import { applyDesktopMigrations } from "./migrate";

export async function runDesktopStartup(): Promise<void> {
  if (!isSqlite) return;
  const dir = process.env.MIGRATIONS_DIR || join(process.cwd(), "prisma", "sqlite", "migrations");
  await applyDesktopMigrations(dir);
}
