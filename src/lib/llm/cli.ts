/**
 * Running the subscription CLIs (Claude Code, Codex) as child processes.
 *
 * Prompts go in on stdin (Windows caps a command line at ~32k chars), each
 * run happens in an empty scratch folder so no project files or CLAUDE.md
 * are picked up, and at most two runs go at once so an import doesn't burn
 * through a plan's limits in parallel.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
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
 * Find a command on PATH. Windows: honours PATHEXT, so `claude` finds
 * claude.exe (native installer) and `codex` finds codex.cmd (npm shim).
 */
export function resolveExecutable(command: string): string | null {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = join(dir, command + ext.toLowerCase());
      if (existsSync(full) && statSync(full).isFile()) return full;
    }
  }
  return null;
}

/**
 * Run a CLI. Arguments are fixed flags and temp-file paths chosen here, never
 * user text (that goes on stdin). An .exe runs directly; an npm .cmd shim has
 * to go through cmd.exe, so it gets one pre-quoted command line.
 */
export async function runCli(
  command: string,
  args: string[],
  opts: { stdin?: string; timeoutMs: number; queue?: boolean }
): Promise<CliResult> {
  const exe = resolveExecutable(command);
  if (!exe) throw new CliNotFoundError(command);
  if (opts.queue !== false) await acquire();
  try {
    return await new Promise<CliResult>((resolve, reject) => {
      const viaShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(exe);
      const spawnOpts = {
        cwd: cliWorkDir(),
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1" },
      };
      const child = viaShell
        ? spawn([exe, ...args].map(winQuote).join(" "), { ...spawnOpts, shell: true })
        : spawn(exe, args, spawnOpts);
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

/**
 * Open a visible terminal running a fixed command (sign-in or install), so
 * the user can follow its prompts. Only called with constants from this app.
 */
export function openTerminal(title: string, commandLine: string): void {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", `"${title}"`, "cmd.exe", "/k", commandLine], {
      cwd: cliWorkDir(),
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: true,
    });
    child.unref();
    return;
  }
  const child = spawn("sh", ["-c", commandLine], { cwd: cliWorkDir(), detached: true, stdio: "ignore" });
  child.unref();
}
