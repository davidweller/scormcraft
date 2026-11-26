import { join } from "node:path";
import { applyDesktopMigrations } from "./migrate";

export async function runDesktopStartup(): Promise<void> {
  const dir = process.env.MIGRATIONS_DIR || join(process.cwd(), "prisma", "migrations");
  await applyDesktopMigrations(dir);
}
