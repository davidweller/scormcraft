/**
 * App settings (desktop): default AI provider, models, API keys.
 * Keys are never sent back to the page, only whether each is set.
 */
import { NextResponse } from "next/server";
import {
  isDesktop,
  isProviderId,
  readAppSettings,
  settingsPath,
  writeAppSettings,
  type AppSettings,
} from "@/lib/settings";
import { availableProviderIds, forgetCliStatus, PROVIDER_LABELS } from "@/lib/llm";
import { claudeCliStatus } from "@/lib/llm/claude-cli";
import { codexCliStatus } from "@/lib/llm/codex-cli";
import { ANTHROPIC_DEFAULT_MODEL } from "@/lib/llm/anthropic-api";
import { OPENAI_FAST_MODEL } from "@/lib/llm/openai-api";
import { CLAUDE_CLI_DEFAULT_MODEL } from "@/lib/llm/claude-cli";

export const dynamic = "force-dynamic";

function keyState(stored?: string, envName?: string) {
  return {
    saved: Boolean(stored),
    hint: stored ? `…${stored.slice(-4)}` : null,
    fromEnvironment: !stored && Boolean(envName && process.env[envName]?.trim()),
  };
}

export async function GET() {
  const s = readAppSettings();
  const desktop = isDesktop();
  const [claude, codex] = desktop
    ? await Promise.all([claudeCliStatus(), codexCliStatus()])
    : [null, null];
  return NextResponse.json({
    desktop,
    editable: Boolean(settingsPath()),
    defaultProvider: s.defaultProvider,
    models: s.models,
    modelDefaults: {
      "openai-api": OPENAI_FAST_MODEL,
      "anthropic-api": ANTHROPIC_DEFAULT_MODEL,
      "claude-subscription": CLAUDE_CLI_DEFAULT_MODEL,
      "chatgpt-subscription": "",
    },
    providers: availableProviderIds().map((id) => ({ id, label: PROVIDER_LABELS[id] })),
    keys: {
      openai: keyState(s.apiKeys.openai, "OPENAI_API_KEY"),
      anthropic: keyState(s.apiKeys.anthropic, "ANTHROPIC_API_KEY"),
      gemini: keyState(s.apiKeys.gemini, "GEMINI_API_KEY"),
    },
    cli: { claude, codex },
  });
}

/**
 * Body: { defaultProvider?, models?, apiKeys? }. In apiKeys, a string sets a
 * key and null removes it; omitted keys are left alone.
 */
export async function PUT(request: Request) {
  if (!settingsPath()) {
    return NextResponse.json({ error: "Settings can only be saved in the desktop app." }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    defaultProvider?: unknown;
    models?: Record<string, unknown>;
    apiKeys?: Record<string, unknown>;
  };
  const current = readAppSettings();
  const next: AppSettings = {
    defaultProvider:
      body.defaultProvider === undefined
        ? current.defaultProvider
        : isProviderId(body.defaultProvider)
          ? body.defaultProvider
          : null,
    models: { ...current.models },
    apiKeys: { ...current.apiKeys },
  };
  if (body.models && typeof body.models === "object") {
    for (const [k, v] of Object.entries(body.models)) {
      if (!isProviderId(k)) continue;
      if (typeof v === "string" && v.trim()) next.models[k] = v.trim();
      else delete next.models[k];
    }
  }
  if (body.apiKeys && typeof body.apiKeys === "object") {
    for (const k of ["openai", "anthropic", "gemini"] as const) {
      if (!(k in body.apiKeys)) continue;
      const v = body.apiKeys[k];
      if (typeof v === "string" && v.trim()) next.apiKeys[k] = v.trim();
      else delete next.apiKeys[k];
    }
  }
  writeAppSettings(next);
  forgetCliStatus();
  return GET();
}
