/**
 * Merge a PATCH of Course.settings into the stored value.
 *
 * Settings hold several independent things (API keys, the AI provider), and
 * the settings page sends only what changed. Top-level keys and `apiKeys`
 * entries are merged; a null value removes that entry.
 */
type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function mergeCourseSettings(current: unknown, patch: unknown): Json {
  const out: Json = isObject(current) ? { ...current } : {};
  if (!isObject(patch)) return out;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "apiKeys" && isObject(value)) {
      const keys: Json = isObject(out.apiKeys) ? { ...out.apiKeys } : {};
      for (const [k, v] of Object.entries(value)) {
        if (v === null || v === "") delete keys[k];
        else keys[k] = v;
      }
      out.apiKeys = keys;
    } else if (value === null) {
      delete out[key];
    } else {
      out[key] = value;
    }
  }
  return out;
}
