/**
 * OpenAI models via the Codex CLI, using the user's ChatGPT plan sign-in.
 *
 * OpenAI doesn't offer ChatGPT-plan login to other apps, so this drives the
 * official CLI the user signs into with `codex login`. Desktop only.
 *
 * Isolation: read-only sandbox, empty working folder, no git repo required.
 * The whole prompt goes on stdin (`-`); the final message is written to a
 * temp file so progress output on stdout can't corrupt it.
 *
 * Flags were taken from the Codex CLI docs; Codex wasn't installed on the
 * machine this was built on, so check `codex exec --help` if a call fails.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CliNotFoundError, cliWorkDir, runCli } from "./cli";
import { LlmSetupError, type JsonRequest, type JsonResponse, type LlmProvider } from "./types";

export const CODEX_CLI = "codex";

export interface CodexCliStatus {
  installed: boolean;
  signedIn: boolean;
  detail?: string;
}

export async function codexCliStatus(): Promise<CodexCliStatus> {
  try {
    const r = await runCli(CODEX_CLI, ["login", "status"], { timeoutMs: 20_000, queue: false });
    const out = `${r.stdout}\n${r.stderr}`.trim();
    const signedIn = r.code === 0 && /logged in/i.test(out) && !/not logged in/i.test(out);
    return { installed: true, signedIn, detail: out.split("\n")[0]?.slice(0, 120) };
  } catch (e) {
    if (e instanceof CliNotFoundError) return { installed: false, signedIn: false };
    return { installed: true, signedIn: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function explainFailure(text: string): Error {
  if (/not logged in|login|unauthori[sz]ed|401/i.test(text)) {
    return new LlmSetupError(
      "Codex isn't signed in. Open Settings and click Sign in under ChatGPT subscription.",
      "chatgpt-subscription"
    );
  }
  if (/usage limit|rate limit|429/i.test(text)) {
    return new Error("Your ChatGPT plan's usage limit has been reached. Wait for it to reset, or switch provider.");
  }
  return new Error(`Codex failed: ${text.trim().slice(0, 400) || "no output"}`);
}

export function codexCliProvider(model?: string): LlmProvider {
  return {
    id: "chatgpt-subscription",
    label: "ChatGPT subscription",
    async completeJson(req: JsonRequest): Promise<JsonResponse> {
      const importTier = req.tier === "import";
      const outFile = join(cliWorkDir(), `codex-${randomBytes(8).toString("hex")}.txt`);
      const prompt =
        `${req.system}\n\nRespond with a single JSON object and nothing else: no code fences, no commentary. ` +
        `Do not run commands or edit files.\n\n---\n\n${req.user}`;
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "--output-last-message",
        outFile,
        ...(model ? ["--model", model] : []),
        "-",
      ];
      try {
        let r;
        try {
          r = await runCli(CODEX_CLI, args, {
            stdin: prompt,
            timeoutMs: req.timeoutMs ?? (importTier ? 600_000 : 240_000),
          });
        } catch (e) {
          if (e instanceof CliNotFoundError) {
            throw new LlmSetupError(
              "Codex isn't installed. Run `npm install -g @openai/codex`, then sign in from Settings.",
              "chatgpt-subscription"
            );
          }
          throw e;
        }
        const text = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
        if (r.code !== 0 || !text.trim()) throw explainFailure(`${r.stderr}\n${r.stdout}`);
        return { text, truncated: false, model: model || "codex default" };
      } finally {
        rmSync(outFile, { force: true });
      }
    },
  };
}
