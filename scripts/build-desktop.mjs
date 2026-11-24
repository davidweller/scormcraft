// Builds the SCORMcraft desktop app.
//
//   npm run desktop:build       standalone server bundle only (.next/standalone)
//   npm run desktop:build:win   ... then the Windows installer in dist/
//
// Steps: SQLite schema + client -> `next build` (standalone, local storage) ->
// strip secrets from the bundle -> electron-builder -> restore the Postgres
// client so `npm run dev` keeps working.

import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname ?? ".", "..");
const win = process.argv.includes("--win");

function run(cmd, env = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
}

// Remove every .env* file from a tree. The standalone bundle copies the
// project's .env files, which hold the Neon url and cloud keys.
function stripEnvFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(p).isDirectory()) stripEnvFiles(p);
    else if (name.startsWith(".env")) {
      rmSync(p);
      console.log(`  removed ${p}`);
    }
  }
}

const buildDataDir = join(root, ".desktop-data");

run("npx tsx scripts/make-sqlite-schema.ts");
run("npx prisma generate --schema prisma/sqlite/schema.prisma");

rmSync(join(root, ".next"), { recursive: true, force: true });
run("npx next build", {
  SCORMCRAFT_DESKTOP_BUILD: "1",
  NEXT_PUBLIC_STORAGE: "local",
  NEXT_PUBLIC_DESKTOP: "1",
  NEXT_DIST_DIR: ".next",
  // Keep the build off Neon and Blob entirely.
  DATABASE_URL: "file:" + join(buildDataDir, "build.db").replace(/\\/g, "/"),
  STORAGE_DIR: join(buildDataDir, "build-files"),
  BLOB_READ_WRITE_TOKEN: "",
  NEXT_TELEMETRY_DISABLED: "1",
});

const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) throw new Error("No standalone server.js; build failed?");
stripEnvFiles(standalone);
if (!existsSync(join(standalone, "src", "generated", "prisma-sqlite", "query_engine-windows.dll.node"))) {
  throw new Error("SQLite Prisma engine missing from the standalone bundle (outputFileTracingIncludes).");
}

if (win) run("npx electron-builder --win --config electron-builder.config.js");

// The desktop build leaves .next as a standalone build; `npm run dev` rebuilds it anyway.
console.log("\nDone." + (win ? " Installer is in dist/." : ""));
