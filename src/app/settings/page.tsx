"use client";

import { useConfirm } from "@/components/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ProviderId = "openai-api" | "anthropic-api" | "claude-subscription" | "chatgpt-subscription";
type KeyName = "openai" | "anthropic" | "gemini";

interface KeyState {
  saved: boolean;
  hint: string | null;
  fromEnvironment: boolean;
}

interface SettingsResponse {
  desktop: boolean;
  editable: boolean;
  defaultProvider: ProviderId | null;
  models: Partial<Record<ProviderId, string>>;
  modelDefaults: Record<ProviderId, string>;
  providers: { id: ProviderId; label: string }[];
  keys: Record<KeyName, KeyState>;
  cli: {
    claude: { installed: boolean; signedIn: boolean; subscription?: string; authMethod?: string } | null;
    codex: { installed: boolean; signedIn: boolean; detail?: string } | null;
  };
}

const KEY_LABELS: Record<KeyName, { title: string; use: string; placeholder: string }> = {
  openai: { title: "OpenAI", use: "content generation and import", placeholder: "sk-…" },
  anthropic: { title: "Anthropic", use: "content generation and import with Claude", placeholder: "sk-ant-…" },
  gemini: { title: "Google Gemini", use: "AI image generation", placeholder: "AIza…" },
};

export default function AppSettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const [refreshing, setRefreshing] = useState(false);
  const [newKeys, setNewKeys] = useState<Record<KeyName, string>>({ openai: "", anthropic: "", gemini: "" });
  const [models, setModels] = useState<Partial<Record<ProviderId, string>>>({});

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load settings.");
      const json = (await res.json()) as SettingsResponse;
      setData(json);
      setModels(json.models);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load settings.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(body: Record<string, unknown>, message = "Saved.") {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string }).error || "Save failed.");
      setData(json as SettingsResponse);
      setModels((json as SettingsResponse).models);
      setNotice(message);
      setTimeout(() => setNotice(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function runCli(tool: "claude" | "codex", action: "login" | "install") {
    setError(null);
    const res = await fetch("/api/settings/cli", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, action }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error || "Could not open a terminal.");
      return;
    }
    setNotice(
      action === "login"
        ? "A terminal window has opened. Finish signing in there (your browser will open), then click Check again."
        : "A terminal window is installing it. When it finishes and you've signed in, click Check again."
    );
  }

  if (!data) {
    return (
      <main className="p-6 lg:p-8">
        <p className="text-gray-500">{error ?? "Loading…"}</p>
      </main>
    );
  }

  const readOnly = !data.editable;
  const claude = data.cli.claude;
  const codex = data.cli.codex;

  return (
    <main className="min-h-screen bg-gray-50/40 p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/" className="text-sm text-brand-600 hover:underline">
            ← Home
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Which AI writes your content, and the keys it uses. A course can override these in its own settings.
          </p>
        </div>

        {readOnly && (
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
            These settings are read-only on the web version. Keys come from the server environment.
          </p>
        )}
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{notice}</p>}

        <section className="space-y-3 rounded-lg border border-gray-200 bg-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold">AI provider</h2>
          <label htmlFor="defaultProvider" className="block text-sm font-medium text-gray-700">
            Default for all courses
          </label>
          <select
            id="defaultProvider"
            value={data.defaultProvider ?? ""}
            disabled={readOnly || saving}
            onChange={(e) => save({ defaultProvider: e.target.value || null }, "Default provider saved.")}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">
              Automatic ({data.desktop ? "Claude subscription if signed in, else an API key" : "first API key found"})
            </option>
            {data.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </section>

        {data.desktop && (
          <section className="space-y-5 rounded-lg border border-gray-200 bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Subscriptions</h2>
              <button
                type="button"
                onClick={() => void load()}
                disabled={refreshing}
                className="rounded border border-gray-300 bg-surface px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {refreshing ? "Checking…" : "Check again"}
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Use your Claude Pro/Max or ChatGPT plan instead of paying per request. SCORMcraft runs the official
              command-line tool you sign in to, so usage counts against your plan&apos;s limits.
            </p>

            <SubscriptionRow
              title="Claude subscription"
              tool="Claude Code"
              installed={claude?.installed ?? false}
              signedIn={claude?.signedIn ?? false}
              detail={
                claude?.signedIn
                  ? claude.authMethod === "claude.ai"
                    ? `Signed in${claude.subscription ? ` (${claude.subscription} plan)` : ""}`
                    : "Signed in with an API account, not a subscription"
                  : undefined
              }
              onLogin={() => runCli("claude", "login")}
              onInstall={() => runCli("claude", "install")}
              model={models["claude-subscription"] ?? ""}
              modelPlaceholder={`${data.modelDefaults["claude-subscription"]} (opus, sonnet, fable, or a model id)`}
              onModel={(v) => setModels({ ...models, "claude-subscription": v })}
              onSaveModel={() => save({ models: { "claude-subscription": models["claude-subscription"] ?? "" } })}
              saving={saving}
            />

            <div className="border-t border-gray-200" />

            <SubscriptionRow
              title="ChatGPT subscription"
              tool="Codex"
              installed={codex?.installed ?? false}
              signedIn={codex?.signedIn ?? false}
              detail={codex?.signedIn ? codex.detail : undefined}
              onLogin={() => runCli("codex", "login")}
              onInstall={() => runCli("codex", "install")}
              model={models["chatgpt-subscription"] ?? ""}
              modelPlaceholder="Codex default"
              onModel={(v) => setModels({ ...models, "chatgpt-subscription": v })}
              onSaveModel={() => save({ models: { "chatgpt-subscription": models["chatgpt-subscription"] ?? "" } })}
              saving={saving}
            />
          </section>
        )}

        <section className="space-y-5 rounded-lg border border-gray-200 bg-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold">API keys</h2>
          {(Object.keys(KEY_LABELS) as KeyName[]).map((k) => {
            const state = data.keys[k];
            const label = KEY_LABELS[k];
            return (
              <div key={k} className="space-y-2">
                <h3 className="text-sm font-medium text-gray-900">
                  {label.title} <span className="font-normal text-gray-500">({label.use})</span>
                </h3>
                {state.saved ? (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-green-700">Key saved {state.hint}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Remove the ${label.title} key?`,
                            message: "Courses that rely on this key will stop generating until another provider is set up.",
                            confirmLabel: "Remove key",
                            danger: true,
                          });
                          if (ok) void save({ apiKeys: { [k]: null } }, "Key removed.");
                        }}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ) : readOnly ? (
                  <p className="text-sm text-gray-500">
                    {state.fromEnvironment ? "Set in the server environment." : "Not set."}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={newKeys[k]}
                      onChange={(e) => setNewKeys({ ...newKeys, [k]: e.target.value })}
                      placeholder={label.placeholder}
                      aria-label={`${label.title} API key`}
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    />
                    <button
                      type="button"
                      disabled={saving || !newKeys[k].trim()}
                      onClick={async () => {
                        await save({ apiKeys: { [k]: newKeys[k].trim() } }, "Key saved.");
                        setNewKeys({ ...newKeys, [k]: "" });
                      }}
                      className="rounded bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                )}
                {!state.saved && !readOnly && state.fromEnvironment && (
                  <p className="text-xs text-gray-400">Using the key from the environment until you save one here.</p>
                )}
                {(k === "openai" || k === "anthropic") && !readOnly && (
                  <ModelField
                    id={k === "openai" ? "openai-api" : "anthropic-api"}
                    value={models[k === "openai" ? "openai-api" : "anthropic-api"] ?? ""}
                    placeholder={data.modelDefaults[k === "openai" ? "openai-api" : "anthropic-api"]}
                    onChange={(v) => setModels({ ...models, [k === "openai" ? "openai-api" : "anthropic-api"]: v })}
                    onSave={() => {
                      const id = k === "openai" ? "openai-api" : "anthropic-api";
                      void save({ models: { [id]: models[id] ?? "" } }, "Model saved.");
                    }}
                    saving={saving}
                  />
                )}
              </div>
            );
          })}
          {data.desktop && (
            <p className="text-xs text-gray-400">Keys are stored on this computer in the SCORMcraft settings file.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function SubscriptionRow(props: {
  title: string;
  tool: string;
  installed: boolean;
  signedIn: boolean;
  detail?: string;
  onLogin: () => void;
  onInstall: () => void;
  model: string;
  modelPlaceholder: string;
  onModel: (v: string) => void;
  onSaveModel: () => void;
  saving: boolean;
}) {
  const status = !props.installed
    ? { text: `${props.tool} isn't installed`, cls: "bg-gray-100 text-gray-700" }
    : props.signedIn
      ? { text: props.detail || "Signed in", cls: "bg-green-50 text-green-700" }
      : { text: "Not signed in", cls: "bg-amber-50 text-amber-800" };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-900">{props.title}</h3>
          <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs ${status.cls}`}>{status.text}</span>
        </div>
        {!props.installed ? (
          <button
            type="button"
            onClick={props.onInstall}
            className="rounded border border-gray-300 bg-surface px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Install {props.tool}
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onLogin}
            className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
          >
            {props.signedIn ? "Switch account" : "Sign in"}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={props.model}
          onChange={(e) => props.onModel(e.target.value)}
          placeholder={props.modelPlaceholder}
          aria-label={`${props.title} model`}
          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={props.onSaveModel}
          disabled={props.saving}
          className="whitespace-nowrap rounded border border-gray-300 bg-surface px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Save model
        </button>
      </div>
    </div>
  );
}

function ModelField(props: {
  id: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex gap-2">
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={`Model: ${props.placeholder}`}
        aria-label={`${props.id} model`}
        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={props.onSave}
        disabled={props.saving}
        className="whitespace-nowrap rounded border border-gray-300 bg-surface px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        Save model
      </button>
    </div>
  );
}
