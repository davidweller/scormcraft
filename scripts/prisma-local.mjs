// Runs the Prisma CLI against a scratch SQLite file, never the app's data.
//
//   npm run db:migrate -- --name add_thing
//
// `prisma migrate dev` replays prisma/migrations into the scratch database and
// writes a new migration for whatever prisma/schema.prisma has changed. The
// app applies it to real data at its next start (src/lib/desktop/migrate.ts).
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dir = join(root, ".desktop-data");
mkdirSync(dir, { recursive: true });
const url = "file:" + join(dir, "migrate-scratch.db").split("\\").join("/");
const args = process.argv.slice(2).join(" ");
execSync(`npx prisma ${args}`, { cwd: root, stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
