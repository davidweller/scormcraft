"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrandConfig, CourseThemeId } from "@/types/branding";
import { COURSE_THEMES, DEFAULT_BRAND_CONFIG, isCourseThemeId } from "@/types/branding";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import { Button, ButtonLink, ErrorNote, PageSkeleton, Select, useToast } from "@/components/ui";

const POPULAR_FONTS = [
  "Ubuntu",
  "Work Sans",
  "Open Sans",
  "Roboto",
  "Lato",
  "Montserrat",
  "Poppins",
  "Inter",
  "Source Sans Pro",
  "Nunito",
];

function darkenHex(hex: string, amount = 0.15): string {
  const h = hex.replace("#", "");
  const num = parseInt(h, 16);
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount));
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount));
  const b = Math.max(0, (num & 0xff) * (1 - amount));
  return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
}

interface Form {
  theme: CourseThemeId;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  contentBg: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string | null;
}

function formFrom(brand: BrandConfig): Form {
  const d = DEFAULT_BRAND_CONFIG;
  return {
    theme: isCourseThemeId(brand.theme) ? brand.theme : "classic",
    primary: brand.primary ?? d.primary ?? "",
    secondary: brand.secondary ?? d.secondary ?? "",
    accent: brand.accent ?? d.accent ?? "",
    background: brand.background ?? d.background ?? "",
    contentBg: brand.contentBg ?? d.contentBg ?? "",
    headingFont: brand.headingFont ?? d.headingFont ?? "",
    bodyFont: brand.bodyFont ?? brand.font ?? d.bodyFont ?? "",
    logoUrl: brand.logoUrl ?? null,
  };
}

const COLOURS: { key: keyof Form; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Page background" },
  { key: "contentBg", label: "Content background" },
];

/** A small picture of a theme's layout, drawn in the chosen colours. */
function ThemeThumb({ theme, form }: { theme: CourseThemeId; form: Form }) {
  const page = theme === "card" ? form.contentBg : form.background;
  const main = theme === "classic" ? form.contentBg : "#ffffff";
  return (
    <div
      className="relative h-20 w-full overflow-hidden rounded border border-gray-200"
      style={{ backgroundColor: page }}
      aria-hidden="true"
    >
      {theme === "banner" && (
        <div className="absolute inset-x-0 top-0 h-9" style={{ backgroundColor: form.primary }} />
      )}
      <div
        className="absolute inset-x-4 bottom-0 top-4 rounded-t p-2"
        style={{
          backgroundColor: main,
          borderTop: theme === "classic" ? `3px solid ${form.accent}` : undefined,
          boxShadow: theme === "classic" ? undefined : "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        <div className="h-1.5 w-1/2 rounded" style={{ backgroundColor: form.primary }} />
        <div className="mt-1.5 h-1 w-full rounded bg-black/10" />
        <div className="mt-1 h-1 w-5/6 rounded bg-black/10" />
        <div className="mt-1 h-1 w-2/3 rounded bg-black/10" />
      </div>
    </div>
  );
}

export default function BrandingPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => formFrom({}));
  const [saved, setSaved] = useState<Form>(() => formFrom({}));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  useUnsavedChanges(dirty);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const loadCourse = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Course not found");
        throw new Error("Failed to load course");
      }
      const data = await res.json();
      const next = formFrom((data.brandConfig as BrandConfig) ?? {});
      setForm(next);
      setSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  // Load the chosen fonts, so the preview shows them and not a fallback.
  const fontHref = useMemo(() => {
    const families = [...new Set([form.headingFont, form.bodyFont].filter(Boolean))]
      .map((f) => `family=${f.trim().replace(/\s+/g, "+")}:wght@400;600;700`)
      .join("&");
    return families ? `https://fonts.googleapis.com/css2?${families}&display=swap` : null;
  }, [form.headingFont, form.bodyFont]);

  async function handleUploadLogo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("prefix", "logos");
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Upload failed");
      }
      const { url } = (await res.json()) as { url: string };
      set("logoUrl", url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const brandConfig: BrandConfig = {
        theme: form.theme,
        primary: form.primary,
        primaryButtonFill: form.primary,
        primaryButtonText: DEFAULT_BRAND_CONFIG.primaryButtonText,
        primaryButtonHover: darkenHex(form.primary),
        secondary: form.secondary,
        secondaryButtonColor: form.secondary,
        secondaryButtonBg: form.background,
        accent: form.accent,
        ctaFill: form.accent,
        ctaText: DEFAULT_BRAND_CONFIG.ctaText,
        background: form.background,
        contentBg: form.contentBg,
        cardBg: DEFAULT_BRAND_CONFIG.cardBg,
        linkColor: form.primary,
        headingFont: form.headingFont,
        bodyFont: form.bodyFont,
        font: form.bodyFont,
        logoUrl: form.logoUrl || null,
      };
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandConfig }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Save failed");
      }
      setSaved(form);
      toast("Branding saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSkeleton label="Loading branding" />;

  return (
    <main className="p-6 lg:p-8">
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Branding</h1>
          <p className="mt-1 text-sm text-gray-500">
            How the exported course looks to learners: layout, colours, logo and fonts.
          </p>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Layout</h2>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Layout">
            {COURSE_THEMES.map((theme) => {
              const active = form.theme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set("theme", theme.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                      : "border-gray-200 bg-surface hover:border-gray-300"
                  }`}
                >
                  <ThemeThumb theme={theme.id} form={form} />
                  <span className="mt-2 block text-sm font-medium text-gray-900">{theme.name}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{theme.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Colours</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {COLOURS.map(({ key, label }) => {
              const value = form[key] as string;
              return (
                <div key={key}>
                  <label htmlFor={`${key}-picker`} className="block text-sm font-medium text-gray-700">
                    {label}
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id={`${key}-picker`}
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
                      onChange={(e) => set(key, e.target.value as never)}
                      className="h-10 w-14 cursor-pointer rounded border border-gray-300 bg-surface"
                    />
                    <input
                      type="text"
                      aria-label={`${label} hex code`}
                      value={value}
                      onChange={(e) => set(key, e.target.value as never)}
                      className="w-24 rounded-md border border-gray-300 bg-surface px-2 py-1 font-mono text-sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Logo</h2>
          {form.logoUrl ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logoUrl}
                alt="Course logo"
                className="h-16 w-auto rounded border border-gray-200 bg-white object-contain p-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  set("logoUrl", null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                aria-label="Logo file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadLogo(file);
                }}
                className="block text-sm text-gray-600 file:mr-4 file:rounded file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                disabled={uploading}
              />
              {uploading && <p className="mt-1 text-sm text-gray-500">Uploading…</p>}
              <p className="mt-1 text-xs text-gray-500">
                PNG, JPG, SVG or WebP. Shown at the top of every page.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Fonts</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="headingFont" className="block text-sm font-medium text-gray-700">
                Heading font
              </label>
              <Select
                id="headingFont"
                value={form.headingFont}
                onChange={(e) => set("headingFont", e.target.value)}
                className="mt-1"
              >
                {POPULAR_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="bodyFont" className="block text-sm font-medium text-gray-700">
                Body font
              </label>
              <Select
                id="bodyFont"
                value={form.bodyFont}
                onChange={(e) => set("bodyFont", e.target.value)}
                className="mt-1"
              >
                {POPULAR_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Sample</h2>
          {/* Fixed dark text: this box shows the learner's page, not the app's theme. */}
          <div
            className="mt-3 rounded-lg border border-gray-200 p-4 text-[#1a1a1a]"
            style={{ backgroundColor: form.background }}
          >
            <div
              className="rounded-b-lg p-4"
              style={{ backgroundColor: form.contentBg, borderTop: `4px solid ${form.accent}` }}
            >
              <p className="text-xl font-bold" style={{ fontFamily: `'${form.headingFont}', sans-serif` }}>
                A page heading
              </p>
              <p className="mt-2 text-sm" style={{ fontFamily: `'${form.bodyFont}', sans-serif` }}>
                Body text in your body font, on the content background.{" "}
                <span style={{ color: form.primary, textDecoration: "underline" }}>A link</span>.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className="rounded px-3 py-1.5 text-sm font-semibold"
                  style={{ backgroundColor: form.primary, color: "#f8f8f8" }}
                >
                  Next →
                </span>
                <span
                  className="rounded border-2 px-3 py-1.5 text-sm font-semibold"
                  style={{ borderColor: form.secondary, color: form.secondary, backgroundColor: form.background }}
                >
                  ← Previous
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} loading={saving} disabled={!dirty}>
            {saving ? "Saving…" : dirty ? "Save branding" : "Saved"}
          </Button>
          <ButtonLink href={`/courses/${courseId}/preview`} variant="secondary">
            Preview course
          </ButtonLink>
          {dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}
        </div>
      </div>
    </main>
  );
}
