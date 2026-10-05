"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function ExportPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const [format, setFormat] = useState<"scorm" | "docx">("scorm");
  const [version, setVersion] = useState<"1.2" | "2004">("1.2");
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          includeAnswers,
          version,
          completionRules: {},
          scoring: {},
          lmsSettings: {},
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Export failed");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? (format === "docx" ? "course.docx" : "scorm-course.zip");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-xl">
        <div>
          <Link href={`/courses/${courseId}`} className="text-blue-600 hover:underline">← Course</Link>
          <h1 className="mt-2 text-2xl font-bold">Export course</h1>
          <p className="mt-1 text-sm text-gray-500">Choose a format and download your course.</p>
        </div>

        {error && (
          <p className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-8 space-y-6">
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700">Format</legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="format"
                  value="scorm"
                  checked={format === "scorm"}
                  onChange={() => setFormat("scorm")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">SCORM package (.zip)</span>
                  <span className="block text-gray-500">Upload to your LMS.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="format"
                  value="docx"
                  checked={format === "docx"}
                  onChange={() => setFormat("docx")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Word document (.docx)</span>
                  <span className="block text-gray-500">For review, editing or print. Interactions become written questions.</span>
                </span>
              </label>
            </div>
          </fieldset>

          {format === "docx" ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeAnswers}
                onChange={(e) => setIncludeAnswers(e.target.checked)}
              />
              Include answers and explanations
            </label>
          ) : (
          <>
          <div>
            <label className="block text-sm font-medium text-gray-700">SCORM version</label>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value as "1.2" | "2004")}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            >
              <option value="1.2">SCORM 1.2</option>
              <option value="2004">SCORM 2004 (3rd ed) — coming soon</option>
            </select>
          </div>
          <p className="text-sm text-gray-500">
            Completion and scoring use default behaviour (complete/incomplete per SCO). LMS settings can be configured in your LMS when importing.
          </p>
          </>
          )}
        </div>

        <div className="mt-10 flex gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Preparing…" : format === "docx" ? "Download DOCX" : "Download ZIP"}
          </button>
          <Link
            href={`/courses/${courseId}`}
            className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Back to course
          </Link>
        </div>
      </div>
    </main>
  );
}
