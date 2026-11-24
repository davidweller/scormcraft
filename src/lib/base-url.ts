/**
 * Base URL of the app (for server-side use: API routes, server components).
 */
export function getBaseUrl(): string {
  // Desktop app: the server calls itself on the port electron/env.js gave it.
  if (process.env.SCORMCRAFT_DESKTOP === "1") {
    return `http://127.0.0.1:${process.env.PORT || "3417"}`;
  }
  if (process.env.VERCEL_URL)return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
