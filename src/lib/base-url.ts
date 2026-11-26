/**
 * Base URL of the app, for server-side calls back into itself. The server
 * listens on the port electron/env.js gave it.
 */
export function getBaseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT || "3417"}`;
}
