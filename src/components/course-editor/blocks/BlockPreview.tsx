"use client";

import { sanitizeHtmlClient } from "@/lib/html/sanitize-client";

/** Blocks the AI can rewrite. Mirrors the lists in the regenerate route. */
export const REGENERABLE_BLOCK_TYPES = [
  "text",
  "heading",
  "key_insight",
  "key_point",
  "multiple_choice",
  "true_false",
  "reflection",
  "drag_and_drop",
  "matching",
  "dialog_cards",
];

const FIELD_LABELS: Record<string, string> = {
  text: "Text",
  title: "Title",
  question: "Question",
  prompt: "Prompt",
  options: "Options",
  items: "Items",
  pairs: "Pairs",
  cards: "Cards",
  explanation: "Explanation",
  correct: "Correct answer",
  correctIndex: "Correct option",
  level: "Level",
};

/** Fields that only make sense to the editor, not to someone comparing text. */
const HIDDEN_FIELDS = new Set(["correctOrder"]);

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** One line that identifies a block: its first piece of real text. */
export function blockSnippet(data: Record<string, unknown>): string {
  for (const key of ["text", "title", "question", "prompt", "label", "filename", "caption", "alt"]) {
    const value = data[key];
    if (typeof value === "string" && stripHtml(value)) return stripHtml(value);
  }
  return "";
}

function Value({ value }: { value: unknown }) {
  if (typeof value === "string") {
    if (/<[a-z][\s\S]*>/i.test(value)) {
      return (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeHtmlClient(value) }}
        />
      );
    }
    return <p className="whitespace-pre-wrap">{value}</p>;
  }
  if (typeof value === "boolean") return <p>{value ? "True" : "False"}</p>;
  if (typeof value === "number") return <p>{value}</p>;
  if (Array.isArray(value)) {
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {value.map((item, i) => (
          <li key={i}>
            {item && typeof item === "object" ? (
              Object.values(item as Record<string, unknown>)
                .filter((v) => typeof v === "string")
                .join(" → ")
            ) : (
              <Value value={item} />
            )}
          </li>
        ))}
      </ol>
    );
  }
  return null;
}

/** A read-only rendering of a block's data, for comparing two versions. */
export function BlockPreview({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([key, value]) =>
      !HIDDEN_FIELDS.has(key) && value !== "" && value !== null && value !== undefined
  );
  if (entries.length === 0) return <p className="text-sm text-gray-400">Empty</p>;
  return (
    <dl className="space-y-3 text-sm text-gray-800">
      {entries.map(([key, value]) => {
        const shown =
          key === "correctIndex" && typeof value === "number" ? `Option ${value + 1}` : value;
        return (
          <div key={key}>
            {entries.length > 1 && (
              <dt className="mb-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                {FIELD_LABELS[key] ?? key}
              </dt>
            )}
            <dd>
              <Value value={shown} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
