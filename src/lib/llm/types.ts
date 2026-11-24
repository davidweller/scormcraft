import type { ProviderId } from "@/lib/settings";

export type { ProviderId };

/**
 * Every AI text call in the app is the same shape: a system prompt, a user
 * prompt, and a JSON object back.
 */
export interface JsonRequest {
  system: string;
  user: string;
  /**
   * "fast": short generations (blueprint, lesson pages, regenerate).
   * "import": long document analysis; uses the provider's stronger setting.
   */
  tier?: "fast" | "import";
  maxOutputTokens?: number;
  /** Per call. Defaults: 60s fast, 180s import (CLI providers get more). */
  timeoutMs?: number;
  /** Short label for logs, e.g. "metadata" or "section 3". */
  label?: string;
}

export interface JsonResponse {
  /** Raw model text, expected to be a JSON object (use parseJsonObject). */
  text: string;
  /** True when the model stopped at the output limit. */
  truncated: boolean;
  model: string;
}

export interface LlmProvider {
  id: ProviderId;
  label: string;
  completeJson(req: JsonRequest): Promise<JsonResponse>;
}

/** Thrown for problems the user can fix: missing key, CLI not installed, not signed in. */
export class LlmSetupError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId | null
  ) {
    super(message);
    this.name = "LlmSetupError";
  }
}

export class LlmTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmTimeoutError";
  }
}
