/**
 * Running the subscription CLIs (Claude Code, Codex) as child processes.
 *
 * Prompts go in on stdin (Windows caps a command line at ~32k chars), each
 * run happens in an empty scratch folder so no project files or CLAUDE.md
 * are picked up, and at most two runs go at once so an import doesn't burn
 * through a plan's limits in parallel.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LlmTimeoutError } from "./types";

const MAX_CONCURRENT = 2;
let running = 0;
const queue: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  running++;
}

function release(): void {
  running--;
  queue.shift()?.();
}

export function cliWorkDir(): string {
  const dir = join(tmpdir(), "scormcraft-ai");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export class CliNotFoundError extends Error {
  constructor(readonly command: string) {
    super(`${command} not found`);
    this.name = "CliNotFoundError";
  }
}

/**
 * Run a CLI. `shell: true` on Windows so npm's .cmd shims resolve; arguments
 * are fixed flags chosen here, never user text (that goes on stdin).
 */
export async function runCli(
  command: string,
  args: string[],
  opts: { stdin?: string; timeoutMs: number; queue?: boolean }
): Promise<CliResult> {
  if (opts.queue !== false) await acquire();
  try {
    return await new Promise<CliResult>((resolve, reject) => {
      const quoted = process.platform === "win32" ? args.map(winQuote) : args;
      const child = spawn(command, quoted, {
        cwd: cliWorkDir(),
        shell: process.platform === "win32",
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1" },
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new LlmTimeoutError(`${command} took longer than ${Math.round(opts.timeoutMs / 1000)}s.`));
      }, opts.timeoutMs);
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(e.code === "ENOENT" ? new CliNotFoundError(command) : e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        // cmd.exe reports a missing command as exit 1 / 9009 with this text.
        if (
          process.platform === "win32" &&
          code !== 0 &&
          /is not recognized as an internal or external command/i.test(stderr)
        ) {
          reject(new CliNotFoundError(command));
          return;
        }
        resolve({ code, stdout, stderr });
      });
      if (opts.stdin != null) child.stdin.end(opts.stdin, "utf8");
      else child.stdin.end();
    });
  } finally {
    if (opts.queue !== false) release();
  }
}

/** Quote one argument for cmd.exe. Our args are flags and short fixed strings. */
function winQuote(arg: string): string {
  if (arg === "") return '""';
  if (!/[\s"&|<>^()%!]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

/** Run a command and open whatever it opens (a browser sign-in), without waiting on output. */
export function launchDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    cwd: cliWorkDir(),
    shell: process.platform === "win32",
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}
