import type { JsonRequest, LlmProvider } from "./types";

/**
 * Parse a model's JSON reply. OpenAI's json_object mode returns bare JSON;
 * Claude and the CLIs occasionally wrap it in a code fence or add a line of
 * prose, so take the outermost {...}.
 */
export function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```\s*$/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  if (body.startsWith("{")) return body;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export function parseJsonObject<T>(text: string): T {
  if (!text.trim()) throw new Error("Empty AI response");
  return JSON.parse(extractJsonText(text)) as T;
}

/**
 * Ask for a JSON object and parse it. Models now and then return JSON that
 * doesn't parse (a stray quote, a cut-off string), so one malformed reply is
 * retried before giving up.
 */
export async function completeJsonObject<T>(llm: LlmProvider, req: JsonRequest): Promise<T> {
  try {
    return parseJsonObject<T>((await llm.completeJson(req)).text);
  } catch (first) {
    if (!(first instanceof SyntaxError)) throw first;
    try {
      return parseJsonObject<T>((await llm.completeJson(req)).text);
    } catch (second) {
      if (!(second instanceof SyntaxError)) throw second;
      throw new Error("The AI's reply couldn't be read, twice in a row. Try again.");
    }
  }
}
