"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface CourseSettings {
  aiProvider?: string;
  apiKeys?: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
  };
}

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [title, setTitle] = useState("");
  const [overview, setOverview] = useState("");
  const [audience, setAudience] = useState("");
  const [targetWordCount, setTargetWordCount] = useState<number | "">("");
  const [tone, setTone] = useState("");
  const [complianceLevel, setComplianceLevel] = useState("");
  const [ilos, setIlos] = useState<string[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [newGeminiKey, setNewGeminiKey] = useState("");
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [newAnthropicKey, setNewAnthropicKey] = useState("");
  const [aiProvider, setAiProvider] = useState("");
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [deleting, setDeleting] = useState(false);

  const loadCourse = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Course not found");
        throw new Error("Failed to load course");
      }
      const data = await res.json();
      setTitle(data.title ?? "");
      setOverview(data.overview ?? "");
      setAudience(data.audience ?? "");
      setTargetWordCount(typeof data.targetWordCount === "number" ? data.targetWordCount : "");
      setTone(data.tone ?? "");
      setComplianceLevel(data.complianceLevel ?? "");
      setIlos(Array.isArray(data.ilos) ? data.ilos : []);
      const settings = data.settings as CourseSettings | null;
      setHasApiKey(Boolean(settings?.apiKeys?.openai));
      setHasGeminiKey(Boolean(settings?.apiKeys?.gemini));
      setHasAnthropicKey(Boolean(settings?.apiKeys?.anthropic));
      setAiProvider(settings?.aiProvider ?? "");
      const appSettings = await fetch("/api/settings").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (appSettings?.providers) setProviders(appSettings.providers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim() || "Untitled Course",
        overview: overview.trim() || null,
        audience: audience.trim() || null,
        targetWordCount: targetWordCount !== "" ? targetWordCount : null,
        tone: tone.trim() || null,
        complianceLevel: complianceLevel.trim() || null,
        ilos: ilos.filter(Boolean),
      };
      const apiKeys: Record<string, string> = {};
      if (newApiKey.trim()) {
        apiKeys.openai = newApiKey.trim();
      }
      if (newGeminiKey.trim()) {
        apiKeys.gemini = newGeminiKey.trim();
      }
      if (newAnthropicKey.trim()) {
        apiKeys.anthropic = newAnthropicKey.trim();
      }
      // The server merges settings, so only changed parts are sent.
      payload.settings = {
        aiProvider: aiProvider || null,
        ...(Object.keys(apiKeys).length > 0 && { apiKeys }),
      };
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Save failed");
      }
      if (newApiKey.trim()) {
        setHasApiKey(true);
        setNewApiKey("");
      }
      if (newGeminiKey.trim()) {
        setHasGeminiKey(true);
        setNewGeminiKey("");
      }
      if (newAnthropicKey.trim()) {
        setHasAnthropicKey(true);
        setNewAnthropicKey("");
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleClearApiKey(keyType: "openai" | "anthropic" | "gemini") {
    const keyName = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini" }[keyType];
    if (!confirm(`Remove the stored ${keyName} API key?`)) return;
    setSaving(true);
    setError(null);
    try {
      const apiKeys: Record<string, string | null> = {};
      apiKeys[keyType] = null;
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { apiKeys } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to clear key");
      }
      if (keyType === "openai") setHasApiKey(false);
      else if (keyType === "anthropic") setHasAnthropicKey(false);
      else setHasGeminiKey(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear key");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this course? This action cannot be undone.")) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to delete course");
      }
      router.push("/courses");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete course");
      setDeleting(false);
    }
  }

  function addIlo() {
    setIlos((prev) => [...prev, ""]);
  }
  function removeIlo(i: number) {
    setIlos((prev) => prev.filter((_, j) => j !== i));
  }
  function setIlo(i: number, value: string) {
    setIlos((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  if (loading) {
    return (
      <main className="p-6 lg:p-8">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Course metadata, learning outcomes, and API configuration.
          </p>
        </div>

        {error && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        {success && (
          <p className="rounded bg-green-50 p-3 text-sm text-green-700">Settings saved.</p>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Course metadata</h2>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="overview" className="block text-sm font-medium text-gray-700">
              Overview
            </label>
            <textarea
              id="overview"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="audience" className="block text-sm font-medium text-gray-700">
                Audience
              </label>
              <input
                id="audience"
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. undergraduate, corporate L&D"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="targetWordCount" className="block text-sm font-medium text-gray-700">
                Target Word Count
              </label>
              <input
                id="targetWordCount"
                type="number"
                min="0"
                value={targetWordCount}
                onChange={(e) => setTargetWordCount(e.target.value ? parseInt(e.target.value, 10) : "")}
                placeholder="e.g. 5000"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="tone" className="block text-sm font-medium text-gray-700">
                Tone
              </label>
              <input
                id="tone"
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. formal, conversational"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="complianceLevel" className="block text-sm font-medium text-gray-700">
                Compliance level
              </label>
              <input
                id="complianceLevel"
                type="text"
                value={complianceLevel}
                onChange={(e) => setComplianceLevel(e.target.value)}
                placeholder="e.g. standard, strict"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Learning outcomes (ILOs)</h2>
            <button
              type="button"
              onClick={addIlo}
              className="rounded bg-gray-200 px-2 py-1 text-sm hover:bg-gray-300"
            >
              + Add
            </button>
          </div>
          {ilos.length === 0 ? (
            <p className="text-sm text-gray-500">No learning outcomes defined.</p>
          ) : (
            <ul className="space-y-2">
              {ilos.map((ilo, i) => (
                <li key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={ilo}
                    onChange={(e) => setIlo(i, e.target.value)}
                    placeholder="By the end of this course…"
                    className="flex-1 rounded border border-gray-300 px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={() => removeIlo(i)}
                    className="text-red-600 hover:underline text-sm"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">AI provider</h2>
          <div>
            <label htmlFor="aiProvider" className="block text-sm font-medium text-gray-700">
              Provider for this course
            </label>
            <select
              id="aiProvider"
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Use the app default</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Set the app default, subscriptions and shared keys in{" "}
              <a href="/settings" className="text-brand-600 hover:underline">
                Settings
              </a>
              .
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">API keys (bring your own)</h2>
          <p className="text-sm text-gray-500">
            Optionally provide your own API keys for AI generation.
          </p>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900">OpenAI (content generation)</h3>
            {hasApiKey ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-green-700">OpenAI key configured</span>
                <button
                  type="button"
                  onClick={() => handleClearApiKey("openai")}
                  disabled={saving}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">
                  OpenAI API key
                </label>
                <input
                  id="apiKey"
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-…"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Stored securely. Leave blank to use the default key.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900">Anthropic (content generation with Claude)</h3>
            {hasAnthropicKey ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-green-700">Anthropic key configured</span>
                <button
                  type="button"
                  onClick={() => handleClearApiKey("anthropic")}
                  disabled={saving}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <label htmlFor="anthropicKey" className="block text-sm font-medium text-gray-700">
                  Anthropic API key
                </label>
                <input
                  id="anthropicKey"
                  type="password"
                  value={newAnthropicKey}
                  onChange={(e) => setNewAnthropicKey(e.target.value)}
                  placeholder="sk-ant-…"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Used when this course&apos;s provider is the Anthropic API. Leave blank to use the app key.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900">Google Gemini (AI image generation)</h3>
            {hasGeminiKey ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-green-700">Gemini key configured</span>
                <button
                  type="button"
                  onClick={() => handleClearApiKey("gemini")}
                  disabled={saving}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <label htmlFor="geminiKey" className="block text-sm font-medium text-gray-700">
                  Gemini API key
                </label>
                <input
                  id="geminiKey"
                  type="password"
                  value={newGeminiKey}
                  onChange={(e) => setNewGeminiKey(e.target.value)}
                  placeholder="Enter Gemini API key"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Used for AI image generation with Nano Banana 2. Leave blank to use the default key.
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-brand-600 px-5 py-2.5 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>

        <section className="space-y-4 border-t border-gray-200 pt-8">
          <h2 className="text-lg font-semibold text-red-600">Danger zone</h2>
          <p className="text-sm text-gray-500">
            Permanently delete this course and all its content. This action cannot be undone.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded border border-red-600 bg-surface px-5 py-2.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete course"}
          </button>
        </section>
      </div>
    </main>
  );
}
