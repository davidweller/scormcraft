import OpenAI from "openai";
import { LlmTimeoutError, type JsonRequest, type JsonResponse, type LlmProvider } from "./types";

export const OPENAI_FAST_MODEL = "gpt-4o-mini";
export const OPENAI_IMPORT_MODEL = process.env.OPENAI_IMPORT_MODEL || "gpt-5.2";

function isTimeout(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; message?: string; code?: string };
  if (err.name === "APIConnectionTimeoutError") return true;
  if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") return true;
  return typeof err.message === "string" && /timed?\s*out|timeout/i.test(err.message);
}

/** The OpenAI calls the app always made, behind the provider interface. */
export function openAiProvider(apiKey: string, model?: string): LlmProvider {
  const clients = new Map<number, OpenAI>();
  const client = (timeout: number, maxRetries: number) => {
    const k = timeout * 10 + maxRetries;
    if (!clients.has(k)) clients.set(k, new OpenAI({ apiKey, timeout, maxRetries }));
    return clients.get(k)!;
  };

  return {
    id: "openai-api",
    label: "OpenAI API",
    async completeJson(req: JsonRequest): Promise<JsonResponse> {
      const importTier = req.tier === "import";
      const useModel = model || (importTier ? OPENAI_IMPORT_MODEL : OPENAI_FAST_MODEL);
      // Import: no retries. The SDK's default 2 retries turn a 3-minute
      // timeout into 9+ minutes of apparent hang.
      const c = client(req.timeoutMs ?? (importTier ? 180_000 : 60_000), importTier ? 0 : 2);
      const tokens =
        req.maxOutputTokens == null
          ? {}
          : useModel.startsWith("gpt-5")
            ? { max_completion_tokens: req.maxOutputTokens }
            : { max_tokens: req.maxOutputTokens };
      try {
        const res = await c.chat.completions.create({
          model: useModel,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          response_format: { type: "json_object" },
          ...tokens,
        });
        const choice = res.choices[0];
        return {
          text: choice?.message?.content ?? "",
          truncated: choice?.finish_reason === "length",
          model: useModel,
        };
      } catch (e) {
        if (isTimeout(e)) throw new LlmTimeoutError(`OpenAI timed out (${useModel}).`);
        throw e;
      }
    },
  };
}
