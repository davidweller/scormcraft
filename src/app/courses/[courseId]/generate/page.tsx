"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface LessonItem {
  id: string;
  title: string;
  moduleTitle: string;
}

type LessonState =
  | { status: "empty" }
  | { status: "has-content" }
  | { status: "generated" }
  | { status: "failed"; error: string };

interface CourseData {
  id: string;
  title: string;
  modules: {
    title: string;
    lessons: {
      id: string;
      title: string;
      pages?: { blocks?: { category: string }[] }[];
    }[];
  }[];
}

/** A lesson has content if any of its pages holds a content block. */
function getInitialStates(modules: CourseData["modules"]): Record<string, LessonState> {
  const initial: Record<string, LessonState> = {};
  for (const mod of modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      const hasContent = (lesson.pages ?? []).some((p) =>
        (p.blocks ?? []).some((b) => b.category === "content")
      );
      initial[lesson.id] = { status: hasContent ? "has-content" : "empty" };
    }
  }
  return initial;
}

export default function GeneratePagesPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const [course, setCourse] = useState<CourseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [states, setStates] = useState<Record<string, LessonState>>({});
  const cancelRef = useRef(false);

  const loadCourse = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Course not found");
        throw new Error("Failed to load course");
      }
      const data = await res.json();
      setCourse(data);
      setStates(getInitialStates(data.modules ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const lessons: LessonItem[] = course
    ? course.modules.flatMap((m) =>
        (m.lessons ?? []).map((l) => ({ id: l.id, title: l.title, moduleTitle: m.title }))
      )
    : [];

  const hasContent = (id: string) =>
    states[id]?.status === "has-content" || states[id]?.status === "generated";
  const emptyLessons = lessons.filter((les) => !hasContent(les.id));
  const busy = generatingId !== null || batch !== null;

  /** Generates one lesson. `overwrite` must be true to replace existing content. */
  async function runLesson(lessonId: string, overwrite: boolean) {
    setGeneratingId(lessonId);
    try {
      const res = await fetch(`/api/courses/${courseId}/lessons/${lessonId}/generate-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overwrite }),
      });
      const data = await res.json().catch(() => ({}));
      setStates((prev) => ({
        ...prev,
        [lessonId]: res.ok
          ? { status: "generated" }
          : res.status === 409
            ? { status: "has-content" }
            : { status: "failed", error: data.error || res.statusText },
      }));
    } catch (e) {
      setStates((prev) => ({
        ...prev,
        [lessonId]: { status: "failed", error: e instanceof Error ? e.message : "Failed" },
      }));
    } finally {
      setGeneratingId(null);
    }
  }

  async function generateOne(les: LessonItem) {
    setError(null);
    const overwrite = hasContent(les.id);
    if (overwrite) {
      const ok = window.confirm(
        `Regenerate "${les.title}"?\n\nThe text and headings on this lesson's first page will be replaced with new AI text. Images, tables, files and interactions are kept. This can't be undone.`
      );
      if (!ok) return;
    }
    await runLesson(les.id, overwrite);
  }

  /** Generates every lesson that has no content, one at a time. */
  async function generateEmpty() {
    const targets = emptyLessons;
    if (targets.length === 0) return;
    setError(null);
    cancelRef.current = false;
    setBatch({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break;
      await runLesson(targets[i].id, false);
      setBatch({ done: i + 1, total: targets.length });
    }
    setBatch(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }
  if (error && !course) {
    return (
      <main className="min-h-screen p-8">
        <Link href="/courses" className="text-brand-600 hover:underline">← Courses</Link>
        <p className="mt-4 text-red-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <div>
          <Link href={`/courses/${courseId}`} className="text-brand-600 hover:underline">← Course</Link>
          <h1 className="mt-2 text-2xl font-bold">Generate Lessons</h1>
          <p className="mt-1 text-sm text-gray-500">{course?.title}</p>
        </div>

        <p className="mt-4 text-gray-600">
          Generate the written content for each lesson. This creates introductions, main content,
          and summaries based on your course blueprint and learning outcomes. Lessons that already
          have content are left alone unless you regenerate them one by one.
        </p>

        {error && <p className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        {lessons.length === 0 ? (
          <p className="mt-6 text-gray-500">
            No lessons yet.{" "}
            <Link href={`/courses/${courseId}/blueprint`} className="text-brand-600 hover:underline">
              Add them in the blueprint
            </Link>{" "}
            first.
          </p>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-between gap-4">
              <p className="text-sm text-gray-600" role="status">
                {batch
                  ? `Generating lesson ${Math.min(batch.done + 1, batch.total)} of ${batch.total}…`
                  : emptyLessons.length === 0
                    ? "Every lesson has content."
                    : `${emptyLessons.length} of ${lessons.length} lesson${lessons.length === 1 ? "" : "s"} still empty.`}
              </p>
              {batch ? (
                <button
                  type="button"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                  className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Stop after this lesson
                </button>
              ) : (
                <button
                  type="button"
                  onClick={generateEmpty}
                  disabled={busy || emptyLessons.length === 0}
                  className="shrink-0 rounded bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Generate empty lessons ({emptyLessons.length})
                </button>
              )}
            </div>
            {batch && (
              <div className="mt-3 h-1.5 overflow-hidden rounded bg-gray-200" aria-hidden="true">
                <div
                  className="h-full bg-brand-600 transition-all"
                  style={{ width: `${(batch.done / batch.total) * 100}%` }}
                />
              </div>
            )}
            <ul className="mt-4 space-y-2">
              {lessons.map((les) => {
                const state = states[les.id] ?? { status: "empty" };
                return (
                  <li
                    key={les.id}
                    className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-gray-50/50 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{les.title}</span>
                      <span className="ml-2 text-xs text-gray-500">{les.moduleTitle}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {state.status === "has-content" && (
                        <span className="text-sm text-gray-600">Has content</span>
                      )}
                      {state.status === "generated" && (
                        <span className="text-sm text-green-600">Generated</span>
                      )}
                      {state.status === "failed" && (
                        <span className="text-sm text-red-600">{state.error}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => generateOne(les)}
                        disabled={busy}
                        className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
                      >
                        {generatingId === les.id
                          ? "Generating…"
                          : hasContent(les.id)
                            ? "Regenerate…"
                            : "Generate"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-10 flex gap-2">
          <Link
            href={`/courses/${courseId}/generate-interactions`}
            className="rounded bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
          >
            Generate Interactions →
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
