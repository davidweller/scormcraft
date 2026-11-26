/**
 * Opens a terminal to sign in to (or install) a subscription CLI. Desktop only.
 * Body: { tool: "claude" | "codex", action: "login" | "install" }.
 * The commands are fixed here; nothing from the request reaches the shell.
 */
import { NextResponse } from "next/server";
import { openTerminal } from "@/lib/llm/cli";
import { forgetCliStatus } from "@/lib/llm";

const COMMANDS = {
  claude: {
    login: { title: "Sign in to Claude", cmd: "claude auth login" },
    install: { title: "Install Claude Code", cmd: "npm install -g @anthropic-ai/claude-code && claude auth login" },
  },
  codex: {
    login: { title: "Sign in to ChatGPT", cmd: "codex login" },
    install: { title: "Install Codex", cmd: "npm install -g @openai/codex && codex login" },
  },
} as const;

export async function POST(request: Request) {
  const { tool, action } = (await request.json().catch(() => ({}))) as { tool?: string; action?: string };
  if ((tool !== "claude" && tool !== "codex") || (action !== "login" && action !== "install")) {
    return NextResponse.json({ error: "Unknown tool or action." }, { status: 400 });
  }
  const { title, cmd } = COMMANDS[tool][action];
  openTerminal(title, cmd);
  forgetCliStatus();
  return NextResponse.json({ ok: true });
}
