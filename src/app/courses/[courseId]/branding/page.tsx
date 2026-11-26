"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import type { BrandConfig } from "@/types/branding";
import { DEFAULT_BRAND_CONFIG } from "@/types/branding";

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

export default function BrandingPage() {
  const params = useParams();
  const courseId = params.courseId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [primary, setPrimary] = useState(DEFAULT_BRAND_CONFIG.primary ?? "");
  const [secondary, setSecondary] = useState(DEFAULT_BRAND_CONFIG.secondary ?? "");
  const [accent, setAccent] = useState(DEFAULT_BRAND_CONFIG.accent ?? "");
  const [background, setBackground] = useState(DEFAULT_BRAND_CONFIG.background ?? "");
  const [contentBg, setContentBg] = useState(DEFAULT_BRAND_CONFIG.contentBg ?? "");
  const [headingFont, setHeadingFont] = useState(DEFAULT_BRAND_CONFIG.headingFont ?? "");
  const [bodyFont, setBodyFont] = useState(DEFAULT_BRAND_CONFIG.bodyFont ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCourse = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Course not found");
        throw new Error("Failed to load course");
      }
      const data = await res.json();
      const brand = (data.brandConfig as BrandConfig) ?? {};
      setPrimary(brand.primary ?? DEFAULT_BRAND_CONFIG.primary ?? "");
      setSecondary(brand.secondary ?? DEFAULT_BRAND_CONFIG.secondary ?? "");
      setAccent(brand.accent ?? DEFAULT_BRAND_CONFIG.accent ?? "");
      setBackground(brand.background ?? DEFAULT_BRAND_CONFIG.background ?? "");
      setContentBg(brand.contentBg ?? DEFAULT_BRAND_CONFIG.contentBg ?? "");
      setHeadingFont(brand.headingFont ?? DEFAULT_BRAND_CONFIG.headingFont ?? "");
      setBodyFont(brand.bodyFont ?? brand.font ?? DEFAULT_BRAND_CONFIG.bodyFont ?? "");
      setLogoUrl(brand.logoUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  async function handleUploadLogo(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("prefix", "logos");
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Upload failed");
      }
      const { url } = (await res.json()) as { url: string };
      setLogoUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUploadLogo(file);
  }

  function handleRemoveLogo() {
    setLogoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const brandConfig: BrandConfig = {
        primary,
        primaryButtonFill: primary,
        primaryButtonText: DEFAULT_BRAND_CONFIG.primaryButtonText,
        primaryButtonHover: darkenHex(primary),
        secondary,
        secondaryButtonColor: secondary,
        secondaryButtonBg: background,
        accent,
        ctaFill: accent,
        ctaText: DEFAULT_BRAND_CONFIG.ctaText,
        background,
        contentBg,
        cardBg: DEFAULT_BRAND_CONFIG.cardBg,
        linkColor: primary,
        headingFont,
        bodyFont,
        font: bodyFont,
        logoUrl: logoUrl || null,
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
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
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
          <h1 className="text-2xl font-bold">Branding</h1>
          <p className="mt-1 text-sm text-gray-500">
            Customise colours, logo, and fonts for the exported SCORM package.
          </p>
        </div>

        {error && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        {success && (
          <p className="rounded bg-green-50 p-3 text-sm text-green-700">Branding saved.</p>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Colours</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="primary" className="block text-sm font-medium text-gray-700">
                Primary
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="primary"
                  type="color"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="secondary" className="block text-sm font-medium text-gray-700">
                Secondary
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="secondary"
                  type="color"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="accent" className="block text-sm font-medium text-gray-700">
                Accent
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="accent"
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="background" className="block text-sm font-medium text-gray-700">
                Page Background
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="background"
                  type="color"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="contentBg" className="block text-sm font-medium text-gray-700">
                Content Background
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="contentBg"
                  type="color"
                  value={contentBg}
                  onChange={(e) => setContentBg(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-gray-300"
                />
                <input
                  type="text"
                  value={contentBg}
                  onChange={(e) => setContentBg(e.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Logo</h2>
          {logoUrl ? (
            <div className="flex items-center gap-4">
              <img
                src={logoUrl}
                alt="Course logo"
                className="h-16 w-auto rounded border border-gray-200 bg-surface object-contain p-1"
              />
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleFileChange}
                className="block text-sm text-gray-600 file:mr-4 file:rounded file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                disabled={uploading}
              />
              {uploading && <p className="mt-1 text-sm text-gray-500">Uploading…</p>}
              <p className="mt-1 text-xs text-gray-400">
                PNG, JPG, SVG, or WebP. Displayed in course header.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Fonts</h2>
          <p className="text-sm text-gray-500">
            Select Google Fonts for headings and body text.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="headingFont" className="block text-sm font-medium text-gray-700">
                Heading font
              </label>
              <select
                id="headingFont"
                value={headingFont}
                onChange={(e) => setHeadingFont(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              >
                {POPULAR_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bodyFont" className="block text-sm font-medium text-gray-700">
                Body font
              </label>
              <select
                id="bodyFont"
                value={bodyFont}
                onChange={(e) => setBodyFont(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              >
                {POPULAR_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section
          className="rounded-lg border border-gray-200 p-4"
          style={{ backgroundColor: background }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: primary, fontFamily: headingFont }}
          >
            Preview
          </h2>
          <div
            className="mt-3 rounded-b-lg p-4"
            style={{ backgroundColor: contentBg, borderTop: `4px solid ${accent}` }}
          >
            <p className="text-sm" style={{ fontFamily: bodyFont }}>
              This is sample body text using your selected body font, displayed on the content background.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: primary, color: "#fff" }}
              >
                Primary
              </button>
              <button
                type="button"
                className="rounded border-2 px-3 py-1.5 text-sm font-medium"
                style={{ borderColor: secondary, color: secondary, backgroundColor: background }}
              >
                Secondary
              </button>
              <button
                type="button"
                className="rounded px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: accent, color: "#1b0101" }}
              >
                Accent
              </button>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-4 pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-brand-600 px-5 py-2.5 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save branding"}
          </button>
          <Link
            href={`/courses/${courseId}/preview`}
            className="text-sm text-brand-600 hover:underline"
          >
            Preview course
          </Link>
        </div>
      </div>
    </main>
  );
}
