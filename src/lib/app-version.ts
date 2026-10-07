/**
 * The app version stamped into exported SCORM packages (sidecar `generator`).
 *
 * Read from the environment rather than importing package.json, which would
 * pull the whole file into the serverless bundle and is resolved differently by
 * Next's two compilers.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";
