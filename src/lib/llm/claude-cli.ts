/**
 * Claude via the Claude Code CLI, using the user's own Pro/Max sign-in.
 *
 * Anthropic doesn't let third-party apps offer claude.ai login, so this drives
 * the official CLI the user is already signed into (`claude -p`). Desktop only:
 * it runs on the user's machine against the user's own plan.
 *
 * Isolation: no tools, no MCP servers, no settings files, no slash commands,
 * no saved session, empty working folder. The system prompt goes in a temp
 * file and the prompt on stdin, so no course text is ever a command-line arg.
 */
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CliNotFoundError, cliWorkDir, runCli } from "./cli";
import { LlmSetupError, type JsonRequest, type JsonResponse, type LlmProvider } from "./types";

export const CLAUDE_CLI = "claude";
export const CLAUDE_CLI_DEFAULT_MODEL = "opus";

interface ClaudeJsonResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  stop_reason?: string;
  modelUsage?: Record<string, unknown>;
}

export interface ClaudeCliStatus {
  installed: boolean;
  signedIn: boolean;
  /** e.g. "claude.ai" for a subscription, "console" for an API account. */
  authMethod?: string;
  subscription?: string;
  error?: string;
}

export async function claudeCliStatus(): Promise<ClaudeCliStatus> {
  try {
    const r = await runCli(CLAUDE_CLI, ["auth", "status", "--json"], { timeoutMs: 20_000, queue: false });
    const data = JSON.parse(r.stdout || "{}") as {
      loggedIn?: boolean;
      authMethod?: string;
      subscriptionType?: string;
    };
    return {
      installed: true,
      signedIn: Boolean(data.loggedIn),
      authMethod: data.authMethod,
      subscription: data.subscriptionType,
    };
  } catch (e) {
    if (e instanceof CliNotFoundError) return { installed: false, signedIn: false };
    return { installed: true, signedIn: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseClaudeCliOutput(stdout: string): ClaudeJsonResult {
  // --output-format json prints one JSON object; tolerate stray lines before it.
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("Claude Code returned no output.");
  return JSON.parse(stdout.slice(start)) as ClaudeJsonResult;
}

function explainFailure(result: ClaudeJsonResult | null, stderr: string): Error {
  const text = `${result?.result ?? ""}\n${stderr}`;
  if (/not logged in|please run .*login|invalid api key|oauth/i.test(text)) {
    return new LlmSetupError(
      "Claude Code isn't signed in. Open Settings and click Sign in under Claude subscription.",
      "claude-subscription"
    );
  }
  if (/usage limit|rate limit|limit reached|out of (extra )?usage/i.test(text)) {
    return new Error(
      "Your Claude plan's usage limit has been reached. Wait for it to reset, or switch provider in Settings."
    );
  }
  return new Error(`Claude Code failed: ${(result?.result || stderr || "no output").trim().slice(0, 400)}`);
}

export function claudeCliProvider(model?: string): LlmProvider {
  const useModel = model || CLAUDE_CLI_DEFAULT_MODEL;
  return {
    id: "claude-subscription",
    label: "Claude subscription",
    async completeJson(req: JsonRequest): Promise<JsonResponse> {
      const importTier = req.tier === "import";
      const sysFile = join(cliWorkDir(), `system-${randomBytes(8).toString("hex")}.txt`);
      writeFileSync(
        sysFile,
        `${req.system}\n\nRespond with a single JSON object and nothing else: no code fences, no commentary.`,
        "utf8"
      );
      try {
        let r;
        try {
          r = await runCli(
            CLAUDE_CLI,
            [
              "-p",
              "--output-format",
              "json",
              "--system-prompt-file",
              sysFile,
              "--model",
              useModel,
              "--effort",
              importTier ? "medium" : "low",
              "--tools",
              "",
              "--setting-sources",
              "",
              "--strict-mcp-config",
              "--disable-slash-commands",
              "--no-session-persistence",
            ],
            { stdin: req.user, timeoutMs: req.timeoutMs ?? (importTier ? 600_000 : 240_000) }
          );
        } catch (e) {
          if (e instanceof CliNotFoundError) {
            throw new LlmSetupError(
              "Claude Code isn't installed. Install it from https://claude.com/claude-code, then sign in from Settings.",
              "claude-subscription"
            );
          }
          throw e;
        }

        let parsed: ClaudeJsonResult | null = null;
        try {
          parsed = parseClaudeCliOutput(r.stdout);
        } catch {
          throw explainFailure(null, r.stderr || r.stdout);
        }
        if (r.code !== 0 || parsed.is_error || parsed.subtype !== "success") {
          throw explainFailure(parsed, r.stderr);
        }
        // modelUsage also lists small side calls (e.g. Haiku); the answer came from the costliest.
        const usedModel =
          Object.entries(parsed.modelUsage ?? {}).sort(
            ([, a], [, b]) =>
              ((b as { costUSD?: number }).costUSD ?? 0) - ((a as { costUSD?: number }).costUSD ?? 0)
          )[0]?.[0] ?? useModel;
        return {
          text: parsed.result ?? "",
          truncated: parsed.stop_reason === "max_tokens",
          model: usedModel,
        };
      } finally {
        rmSync(sysFile, { force: true });
      }
    },
  };
}
