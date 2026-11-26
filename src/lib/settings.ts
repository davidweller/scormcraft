/**
 * App-wide settings: the default AI provider, models and API keys.
 *
 * Stored in SETTINGS_PATH (%APPDATA%/SCORMcraft/data/settings.json) and edited
 * on the /settings page. With SETTINGS_PATH unset (tests), nothing is stored
 * and keys come from the environment.
 *
 * Per-course settings (`Course.settings.apiKeys`, `.aiProvider`) override these.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const PROVIDER_IDS = [
  "openai-api",
  "anthropic-api",
  "claude-subscription",
  "chatgpt-subscription",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

export interface AppSettings {
  /** null = pick automatically (see resolveProviderId in src/lib/llm). */
  defaultProvider: ProviderId | null;
  models: Partial<Record<ProviderId, string>>;
  apiKeys: { openai?: string; anthropic?: string; gemini?: string };
}

const EMPTY: AppSettings = { defaultProvider: null, models: {}, apiKeys: {} };

export function settingsPath(): string | null {
  return process.env.SETTINGS_PATH?.trim() || null;
}

let cache: { mtimeMs: number; value: AppSettings } | null = null;

function sanitize(raw: unknown): AppSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const models: AppSettings["models"] = {};
  if (r.models && typeof r.models === "object") {
    for (const [k, v] of Object.entries(r.models as Record<string, unknown>)) {
      if (isProviderId(k) && typeof v === "string" && v.trim()) models[k] = v.trim();
    }
  }
  const keys = (r.apiKeys && typeof r.apiKeys === "object" ? r.apiKeys : {}) as Record<string, unknown>;
  const apiKeys: AppSettings["apiKeys"] = {};
  for (const k of ["openai", "anthropic", "gemini"] as const) {
    if (typeof keys[k] === "string" && (keys[k] as string).trim()) apiKeys[k] = (keys[k] as string).trim();
  }
  return {
    defaultProvider: isProviderId(r.defaultProvider) ? r.defaultProvider : null,
    models,
    apiKeys,
  };
}

export function readAppSettings(): AppSettings {
  const p = settingsPath();
  if (!p || !existsSync(p)) return { ...EMPTY, models: {}, apiKeys: {} };
  try {
    const mtimeMs = statSync(p).mtimeMs;
    if (cache && cache.mtimeMs === mtimeMs) return cache.value;
    const value = sanitize(JSON.parse(readFileSync(p, "utf8")));
    cache = { mtimeMs, value };
    return value;
  } catch {
    return { ...EMPTY, models: {}, apiKeys: {} };
  }
}

export function writeAppSettings(next: AppSettings): AppSettings {
  const p = settingsPath();
  if (!p) throw new Error("Settings can't be saved: SETTINGS_PATH is not set.");
  const value = sanitize(next);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(value, null, 2), "utf8");
  cache = null;
  return value;
}

/** Key lookup order: course key, then app settings, then environment. */
export function resolveApiKey(
  kind: "openai" | "anthropic" | "gemini",
  courseKey?: string | null
): string | null {
  const envName = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY" }[kind];
  return courseKey?.trim() || readAppSettings().apiKeys[kind] || process.env[envName]?.trim() || null;
}
