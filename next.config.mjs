/** @type {import('next').NextConfig} */

// Desktop build (`npm run desktop:build:win`): a standalone server bundle that
// electron-builder packs, including the SQLite Prisma client and its engine.
const DESKTOP_BUILD = process.env.SCORMCRAFT_DESKTOP_BUILD === "1";

const nextConfig = {
  // `desktop:dev` writes to .next-desktop so it can run beside `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    instrumentationHook: true,
    ...(DESKTOP_BUILD && {
      outputFileTracingIncludes: {
        "/**": ["./src/generated/prisma-sqlite/**/*"],
      },
    }),
  },
  ...(DESKTOP_BUILD && { output: "standalone" }),
};

export default nextConfig;
