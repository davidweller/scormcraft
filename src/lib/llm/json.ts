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
