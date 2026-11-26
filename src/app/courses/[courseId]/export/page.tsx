"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { fetchCourse } from "@/lib/api";
import { getCourseIssues, type CourseIssue } from "@/lib/course-tree";
import { Button, ButtonLink, ErrorNote, Field, Select, Skeleton, useToast } from "@/components/ui";

export default function ExportPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const toast = useToast();
  const [format, setFormat] = useState<"scorm" | "docx">("scorm");
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<CourseIssue[] | null>(null);
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCourse(courseId)
      .then((course) => {
        if (cancelled) return;
        setIssues(getCourseIssues(course));
        setLastExportedAt((course as { lastExportedAt?: string | null }).lastExportedAt ?? null);
      })
      .catch(() => {
        if (!cancelled) setIssues([]);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

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
          version: "1.2",
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
      if (format === "scorm") setLastExportedAt(new Date().toISOString());
      toast(`Downloaded ${filename}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  const errors = (issues ?? []).filter((i) => i.severity === "error");
  const warnings = (issues ?? []).filter((i) => i.severity === "warning");

  return (
    <main className="min-h-[calc(100vh-3rem)] p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">Export course</h1>
        <p className="mt-1 text-sm text-gray-500">
          Choose a format and download your course.
          {lastExportedAt &&
            ` Last exported as SCORM on ${new Date(lastExportedAt).toLocaleDateString()}.`}
        </p>

        <section className="mt-6" aria-label="Readiness">
          {issues === null ? (
            <Skeleton className="h-14 w-full" />
          ) : issues.length === 0 ? (
            <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircleIcon className="h-5 w-5 shrink-0" />
              No problems found. The course is ready to export.
            </p>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-medium">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
                {errors.length > 0
                  ? `${errors.length} thing${errors.length === 1 ? "" : "s"} to fix before learners see this`
                  : `${warnings.length} thing${warnings.length === 1 ? "" : "s"} to check`}
              </p>
              <ul className="mt-2 space-y-1 pl-7">
                {[...errors, ...warnings].slice(0, 8).map((issue, i) => (
                  <li key={i}>
                    {issue.message}
                    {issue.path && (
                      <>
                        {" "}
                        <Link href={issue.path} className="font-medium underline">
                          Fix
                        </Link>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 pl-7 text-xs">
                {issues.length > 8 && `${issues.length - 8} more. `}
                You can still export.{" "}
                <Link href={`/courses/${courseId}/review`} className="underline">
                  See the full review
                </Link>
              </p>
            </div>
          )}
        </section>

        {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

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
                  <span className="block text-gray-500">
                    For review, editing or print. Interactions become written questions.
                  </span>
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
              <Field
                label="SCORM version"
                hint="Completion is recorded per page as complete or incomplete. Other LMS settings are set in your LMS when you upload the package."
              >
                {(id) => (
                  <Select id={id} value="1.2" onChange={() => {}}>
                    <option value="1.2">SCORM 1.2</option>
                    <option value="2004" disabled>
                      SCORM 2004 (not available yet)
                    </option>
                  </Select>
                )}
              </Field>
            </>
          )}
        </div>

        <div className="mt-10 flex gap-2">
          <Button onClick={handleExport} loading={loading}>
            {loading ? "Preparing…" : format === "docx" ? "Download DOCX" : "Download ZIP"}
          </Button>
          <ButtonLink href={`/courses/${courseId}`} variant="secondary">
            Back to course
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
