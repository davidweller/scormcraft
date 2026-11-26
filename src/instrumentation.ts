/**
 * Next.js startup hook. Brings the local database up to date before the
 * first request is served.
 *
 * The NEXT_RUNTIME check must wrap the import directly so the edge bundle
 * drops it (the runner uses node:fs).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runDesktopStartup } = await import("./lib/desktop/startup");
    await runDesktopStartup();
  }
}
