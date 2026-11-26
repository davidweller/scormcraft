/**
 * Picks the AI provider for a request.
 *
 * Order: the course's own choice, then the app default from Settings, then
 * automatic: Claude subscription (desktop, signed in) -> OpenAI key ->
 * Anthropic key. Keys resolve course -> app settings -> environment.
 */
import { readAppSettings, resolveApiKey, type ProviderId } from "@/lib/settings";
import { anthropicProvider } from "./anthropic-api";
import { claudeCliProvider, claudeCliStatus } from "./claude-cli";
import { codexCliProvider } from "./codex-cli";
import { openAiProvider } from "./openai-api";
import { LlmSetupError, type LlmProvider } from "./types";

export * from "./types";
export { parseJsonObject } from "./json";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  "openai-api": "OpenAI API key",
  "anthropic-api": "Anthropic API key",
  "claude-subscription": "Claude subscription (Claude Code)",
  "chatgpt-subscription": "ChatGPT subscription (Codex)",
};

export interface CourseAiSettings {
  aiProvider?: string | null;
  apiKeys?: { openai?: string | null; anthropic?: string | null; gemini?: string | null } | null;
}

let claudeSignedIn: { at: number; value: boolean } | null = null;
async function claudeReady(): Promise<boolean> {
  if (claudeSignedIn && Date.now() - claudeSignedIn.at < 60_000) return claudeSignedIn.value;
  const s = await claudeCliStatus();
  claudeSignedIn = { at: Date.now(), value: s.installed && s.signedIn };
  return claudeSignedIn.value;
}

export function forgetCliStatus(): void {
  claudeSignedIn = null;
}

export function availableProviderIds(): ProviderId[] {
  return ["openai-api", "anthropic-api", "claude-subscription", "chatgpt-subscription"];
}

async function resolveProviderId(course?: CourseAiSettings | null): Promise<ProviderId> {
  const allowed = availableProviderIds();
  const chosen = [course?.aiProvider, readAppSettings().defaultProvider].find(
    (p): p is ProviderId => typeof p === "string" && (allowed as string[]).includes(p)
  );
  if (chosen) return chosen;

  if (await claudeReady()) return "claude-subscription";
  if (resolveApiKey("openai", course?.apiKeys?.openai)) return "openai-api";
  if (resolveApiKey("anthropic", course?.apiKeys?.anthropic)) return "anthropic-api";
  throw new LlmSetupError(
    "No AI provider is set up. Open Settings to sign in with your Claude or ChatGPT subscription, or add an API key.",
    null
  );
}

/** The provider for a course (or app-wide when no course). Throws LlmSetupError if none is usable. */
export async function getLlm(course?: CourseAiSettings | null): Promise<LlmProvider> {
  const id = await resolveProviderId(course);
  const model = readAppSettings().models[id];
  switch (id) {
    case "openai-api": {
      const key = resolveApiKey("openai", course?.apiKeys?.openai);
      if (!key) throw new LlmSetupError("No OpenAI API key. Add one in Settings or course settings.", id);
      return openAiProvider(key, model);
    }
    case "anthropic-api": {
      const key = resolveApiKey("anthropic", course?.apiKeys?.anthropic);
      if (!key) throw new LlmSetupError("No Anthropic API key. Add one in Settings or course settings.", id);
      return anthropicProvider(key, model);
    }
    case "claude-subscription":
      return claudeCliProvider(model);
    case "chatgpt-subscription":
      return codexCliProvider(model);
  }
}

/** Course.settings narrowed to the AI fields. */
export function courseAiSettings(settings: unknown): CourseAiSettings | null {
  return settings && typeof settings === "object" ? (settings as CourseAiSettings) : null;
}
