/** @type {import('next').NextConfig} */
const nextConfig = {
  // `npm run dev` writes to .next-desktop so it can't clash with a packaged build in .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    instrumentationHook: true,
  },
  // A standalone server bundle, which electron-builder packs into the app.
  output: "standalone",
};

export default nextConfig;
