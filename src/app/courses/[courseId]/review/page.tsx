"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ValidationReport {
  readingTimeMinutes: number;
  totalWords: number;
  coverage: { iloIndex: number; ilo: string; covered: boolean; notes: string }[];
  accessibility: { type: string; message: string; pageId?: string }[];
  brokenLinks: { url: string; pageId?: string }[];
}

export default function ReviewPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/validate`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Course not found");
        throw new Error("Validation failed");
      }
      const data = await res.json();
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-gray-500">Running validation…</p>
      </main>
    );
  }
  if (error && !report) {
    return (
      <main className="min-h-screen p-8">
        <Link href="/courses" className="text-brand-600 hover:underline">← Courses</Link>
        <p className="mt-4 text-red-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl">
        <div>
          <Link href={`/courses/${courseId}`} className="text-brand-600 hover:underline">← Course</Link>
          <h1 className="mt-2 text-2xl font-bold">Review</h1>
          <p className="mt-1 text-sm text-gray-500">Validation report before export</p>
        </div>

        {report && (
          <div className="mt-8 space-y-8">
            <section>
              <h2 className="text-lg font-semibold">Reading time</h2>
              <p className="mt-1 text-gray-600">
                ~{report.readingTimeMinutes} min ({report.totalWords} words at 200 wpm)
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Coverage vs ILOs</h2>
              {report.coverage.length === 0 ? (
                <p className="mt-1 text-gray-500">No ILOs defined. Add them in the blueprint.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {report.coverage.map((c) => (
                    <li
                      key={c.iloIndex}
                      className={`flex items-start gap-2 rounded border p-3 ${
                        c.covered ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"
                      }`}
                    >
                      <span className={c.covered ? "text-green-600" : "text-amber-600"}>
                        {c.covered ? "✓" : "!"}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{c.ilo}</p>
                        <p className="text-xs text-gray-500">{c.notes}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold">Accessibility</h2>
              {report.accessibility.length === 0 ? (
                <p className="mt-1 text-gray-500">No issues found.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {report.accessibility.map((a, i) => (
                    <li key={i} className="flex items-center justify-between rounded border border-amber-200 bg-amber-50/50 p-3">
                      <span className="text-sm">
                        [{a.type}] {a.message}
                      </span>
                      {a.pageId && (
                        <Link
                          href={`/courses/${courseId}/edit/page/${a.pageId}`}
                          className="text-sm text-brand-600 hover:underline"
                        >
                          Go to page
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold">Link checks</h2>
              {report.brokenLinks.length === 0 ? (
                <p className="mt-1 text-gray-500">No broken links detected (or no links checked).</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {report.brokenLinks.map((b, i) => (
                    <li key={i} className="flex items-center justify-between rounded border border-red-200 bg-red-50/50 p-3">
                      <span className="truncate text-sm text-gray-700">{b.url}</span>
                      {b.pageId && (
                        <Link
                          href={`/courses/${courseId}/edit/page/${b.pageId}`}
                          className="ml-2 shrink-0 text-sm text-brand-600 hover:underline"
                        >
                          Go to page
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <div className="mt-10 flex gap-2">
          <Link
            href={`/courses/${courseId}/export`}
            className="rounded bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
          >
            Export SCORM
          </Link>
          <Link
            href={`/courses/${courseId}/edit`}
            className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Edit course
          </Link>
        </div>
      </div>
    </main>
  );
}
