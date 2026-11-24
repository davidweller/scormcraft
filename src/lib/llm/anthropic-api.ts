import Anthropic from "@anthropic-ai/sdk";
import { LlmTimeoutError, type JsonRequest, type JsonResponse, type LlmProvider } from "./types";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

/**
 * Claude via the Anthropic API (pay-as-you-go key).
 *
 * Streams every call so long imports don't hit HTTP timeouts, sets effort
 * explicitly (Opus 5.5 defaults to medium), and opts into server-side
 * fallbacks so a classifier refusal is retried on another model in the same
 * call. A refusal that survives the fallback is reported as an error.
 */
export function anthropicProvider(apiKey: string, model?: string): LlmProvider {
  const clients = new Map<number, Anthropic>();
  const client = (timeout: number) => {
    if (!clients.has(timeout)) clients.set(timeout, new Anthropic({ apiKey, timeout, maxRetries: 1 }));
    return clients.get(timeout)!;
  };
  const useModel = model || ANTHROPIC_DEFAULT_MODEL;

  return {
    id: "anthropic-api",
    label: "Anthropic API",
    async completeJson(req: JsonRequest): Promise<JsonResponse> {
      const importTier = req.tier === "import";
      const c = client(req.timeoutMs ?? (importTier ? 300_000 : 120_000));
      try {
        const stream = c.beta.messages.stream({
          model: useModel,
          max_tokens: Math.max(req.maxOutputTokens ?? 16_000, importTier ? 32_000 : 16_000),
          output_config: { effort: importTier ? "medium" : "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: `${req.system}\n\nRespond with a single JSON object and nothing else: no code fences, no commentary.`,
          messages: [{ role: "user", content: req.user }],
        });
        const message = await stream.finalMessage();
        if (message.stop_reason === "refusal") {
          throw new Error("Claude declined this request. Try rewording it, or switch provider in Settings.");
        }
        const text = message.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        return { text, truncated: message.stop_reason === "max_tokens", model: message.model };
      } catch (e) {
        if (e instanceof Anthropic.APIConnectionTimeoutError) {
          throw new LlmTimeoutError(`Claude timed out (${useModel}).`);
        }
        if (e instanceof Anthropic.AuthenticationError) {
          throw new Error("The Anthropic API key was rejected. Check it in Settings.");
        }
        if (e instanceof Anthropic.RateLimitError) {
          throw new Error("Anthropic rate limit reached. Wait a minute and retry.");
        }
        throw e;
      }
    },
  };
}
