"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_BRAND_CONFIG } from "@/types/branding";
import ImportCourseModal from "@/components/course-import/ImportCourseModal";
import ImportScormModal from "@/components/course-import/ImportScormModal";

export default function NewCoursePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [overview, setOverview] = useState("");
  const [audience, setAudience] = useState("");
  const [targetWordCount, setTargetWordCount] = useState<number | "">("");
  const [tone, setTone] = useState("");
  const [complianceLevel, setComplianceLevel] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_BRAND_CONFIG.primary ?? "");
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_BRAND_CONFIG.secondary ?? "");
  const [accentColor, setAccentColor] = useState(DEFAULT_BRAND_CONFIG.accent ?? "");
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BRAND_CONFIG.background ?? "");
  const [contentBgColor, setContentBgColor] = useState(DEFAULT_BRAND_CONFIG.contentBg ?? "");
  const [font, setFont] = useState(DEFAULT_BRAND_CONFIG.bodyFont ?? DEFAULT_BRAND_CONFIG.font ?? "");
  const [headingFont, setHeadingFont] = useState(DEFAULT_BRAND_CONFIG.headingFont ?? "");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showBranding, setShowBranding] = useState(false);
  const [showByoKeys, setShowByoKeys] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showScormImportModal, setShowScormImportModal] = useState(false);

  function handleImportComplete(courseId: string) {
    router.push(`/courses/${courseId}/blueprint`);
  }

  function handleScormImportComplete(courseId: string) {
    // Straight to the editor, not the blueprint: an imported SCORM course
    // already has its structure and content, so there is nothing to generate.
    router.push(`/courses/${courseId}/edit`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const brandConfig = {
        ...DEFAULT_BRAND_CONFIG,
        ...(primaryColor && { primary: primaryColor, primaryButtonFill: primaryColor, linkColor: primaryColor, secondaryButtonColor: primaryColor }),
        ...(secondaryColor && { secondary: secondaryColor }),
        ...(accentColor && { accent: accentColor, ctaFill: accentColor }),
        ...(backgroundColor && { background: backgroundColor, secondaryButtonBg: backgroundColor }),
        ...(contentBgColor && { contentBg: contentBgColor }),
        ...(font.trim() && { font: font.trim(), bodyFont: font.trim() }),
        ...(headingFont.trim() && { headingFont: headingFont.trim() }),
      };
      const settings =
        openaiKey.trim() ? { apiKeys: { openai: openaiKey.trim() } } : undefined;

      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "Untitled Course",
          overview: overview.trim() || undefined,
          audience: audience.trim() || undefined,
          targetWordCount: targetWordCount !== "" ? targetWordCount : undefined,
          tone: tone.trim() || undefined,
          complianceLevel: complianceLevel.trim() || undefined,
          brandConfig,
          settings,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create course");
      }
      const course = await res.json();
      router.push(`/courses/${course.id}/blueprint`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Create course</h1>
            <p className="mt-1 text-sm text-gray-500">
              Add title, audience, and options. You&apos;ll define the blueprint next.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/templates/course-template.docx"
              download
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download template
            </a>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import course
            </button>
            <button
              type="button"
              onClick={() => setShowScormImportModal(true)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              Import SCORM package
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {error && (
            <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                Title / topic
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Introduction to Data Privacy"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="overview" className="block text-sm font-medium text-gray-700">
                Overview (optional)
              </label>
              <textarea
                id="overview"
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
                rows={3}
                placeholder="Brief description of the course"
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
                  placeholder="e.g. corporate L&D, undergraduates"
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
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="tone" className="block text-sm font-medium text-gray-700">
                  Tone
                </label>
                <select
                  id="tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                >
                  <option value="">Select (optional)</option>
                  <option value="formal">Formal</option>
                  <option value="conversational">Conversational</option>
                  <option value="technical">Technical</option>
                  <option value="friendly">Friendly</option>
                </select>
              </div>
              <div>
                <label htmlFor="complianceLevel" className="block text-sm font-medium text-gray-700">
                  Compliance level
                </label>
                <select
                  id="complianceLevel"
                  value={complianceLevel}
                  onChange={(e) => setComplianceLevel(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                >
                  <option value="">Select (optional)</option>
                  <option value="standard">Standard</option>
                  <option value="strict">Strict</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowBranding(!showBranding)}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {showBranding ? "−" : "+"} Branding (optional)
            </button>
            {showBranding && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-gray-500">Primary (buttons, links)</label>
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#015887"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Secondary (outline)</label>
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    placeholder="#015887"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Accent / CTA</label>
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    placeholder="#ff7700"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Page Background</label>
                  <input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    placeholder="#ffffff"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Content Background</label>
                  <input
                    type="text"
                    value={contentBgColor}
                    onChange={(e) => setContentBgColor(e.target.value)}
                    placeholder="#f7f8fa"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Heading font</label>
                  <input
                    type="text"
                    value={headingFont}
                    onChange={(e) => setHeadingFont(e.target.value)}
                    placeholder="Work Sans"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Body font</label>
                  <input
                    type="text"
                    value={font}
                    onChange={(e) => setFont(e.target.value)}
                    placeholder="Ubuntu"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => setShowByoKeys(!showByoKeys)}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {showByoKeys ? "−" : "+"} Bring your own API keys (optional)
            </button>
            {showByoKeys && (
              <div className="mt-3">
                <label htmlFor="openaiKey" className="block text-xs text-gray-500">
                  OpenAI API key (for AI blueprint and content generation)
                </label>
                <input
                  id="openaiKey"
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create and go to blueprint"}
            </button>
            <Link
              href="/courses"
              className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>

      <ImportCourseModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={handleImportComplete}
        openaiKey={openaiKey || undefined}
      />

      <ImportScormModal
        isOpen={showScormImportModal}
        onClose={() => setShowScormImportModal(false)}
        onImportComplete={handleScormImportComplete}
      />
    </main>
  );
}
