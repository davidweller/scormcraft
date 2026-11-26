// Builds the SCORMcraft desktop app.
//
//   npm run desktop:build       standalone server bundle only (.next/standalone)
//   npm run desktop:build:win   ... then the Windows installer in dist/
//
// Steps: Prisma client -> `next build` (standalone) -> strip secrets from the
// bundle -> electron-builder.

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
// project's .env files, which hold API keys.
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

run("npx prisma generate");

rmSync(join(root, ".next"), { recursive: true, force: true });
run("npx next build", {
  NEXT_DIST_DIR: ".next",
  // The build must not touch real data.
  DATABASE_URL: "file:" + join(buildDataDir, "build.db").replace(/\\/g, "/"),
  STORAGE_DIR: join(buildDataDir, "build-files"),
  NEXT_TELEMETRY_DISABLED: "1",
});

const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) throw new Error("No standalone server.js; build failed?");
stripEnvFiles(standalone);
if (!existsSync(join(standalone, "node_modules", ".prisma", "client", "query_engine-windows.dll.node"))) {
  throw new Error("Prisma engine missing from the standalone bundle.");
}

if (win) run("npx electron-builder --win --config electron-builder.config.js");

console.log("\nDone." + (win ? " Installer is in dist/." : ""));
