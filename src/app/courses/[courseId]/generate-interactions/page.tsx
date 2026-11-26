"use client";

import { LoadingLines } from "@/components/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { InteractionConfig, InteractionBlockType, InteractionDensity } from "@/types/course";

interface LessonItem {
  id: string;
  title: string;
  moduleTitle: string;
  hasContent: boolean;
  interactionCount: number;
}

interface Block {
  category: "content" | "interaction";
}

interface CourseData {
  id: string;
  title: string;
  ilos: string[] | null;
  assessmentPlan: string | null;
  modules: {
    title: string;
    lessons: {
      id: string;
      title: string;
      pages?: {
        blocks?: Block[];
      }[];
    }[];
  }[];
}

const DEFAULT_CONFIG: InteractionConfig = {
  enabledTypes: ["reflection", "multiple_choice", "true_false", "drag_and_drop", "matching", "dialog_cards"],
  density: "moderate",
  placement: {
    withinLessons: true,
    endOfModule: false,
    finalAssessment: false,
  },
  includeExplanations: true,
};

const INTERACTION_TYPE_LABELS: Record<InteractionBlockType, string> = {
  reflection: "Reflections",
  multiple_choice: "Multiple Choice",
  true_false: "True/False",
  drag_and_drop: "Drag & Drop",
  matching: "Matching",
  dialog_cards: "Dialog Cards",
};

const ALL_INTERACTION_TYPES: InteractionBlockType[] = [
  "multiple_choice",
  "true_false",
  "drag_and_drop",
  "matching",
  "reflection",
  "dialog_cards",
];

export default function GenerateInteractionsPage() {
  const params = useParams();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<CourseData | null>(null);
  const [config, setConfig] = useState<InteractionConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [results, setResults] = useState<Record<string, { success: boolean; error?: string; count?: number }>>({});

  const loadCourse = useCallback(async () => {
    setError(null);
    try {
      const [courseRes, configRes] = await Promise.all([
        fetch(`/api/courses/${courseId}`),
        fetch(`/api/courses/${courseId}/generate-interactions`),
      ]);

      if (!courseRes.ok) {
        if (courseRes.status === 404) throw new Error("Course not found");
        throw new Error("Failed to load course");
      }

      const courseData = await courseRes.json();
      setCourse(courseData);

      if (configRes.ok) {
        const configData = await configRes.json();
        if (configData.config) {
          setConfig(configData.config);
        }
      }
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
        (m.lessons ?? []).map((l) => ({
          id: l.id,
          title: l.title,
          moduleTitle: m.title,
          hasContent: (l.pages ?? []).some((p) => (p.blocks ?? []).some(b => b.category === "content")),
          interactionCount: (l.pages ?? []).reduce(
            (sum, p) => sum + (p.blocks ?? []).filter(b => b.category === "interaction").length,
            0
          ),
        }))
      )
    : [];

  const lessonsWithContent = lessons.filter((l) => l.hasContent);
  const lessonsWithoutInteractions = lessonsWithContent.filter((l) => l.interactionCount === 0);

  async function generateOne(lessonId: string) {
    setGeneratingId(lessonId);
    setError(null);
    try {
      const densityCount = config.density === "light" ? 1 : config.density === "heavy" ? 3 : 2;
      const res = await fetch(`/api/courses/${courseId}/lessons/${lessonId}/generate-interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          types: config.enabledTypes,
          count: densityCount,
          includeExplanations: config.includeExplanations,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResults((prev) => ({
          ...prev,
          [lessonId]: { success: false, error: data.error || res.statusText },
        }));
      } else {
        setResults((prev) => ({
          ...prev,
          [lessonId]: { success: true, count: data.generatedCount },
        }));
        loadCourse();
      }
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [lessonId]: { success: false, error: e instanceof Error ? e.message : "Failed" },
      }));
    } finally {
      setGeneratingId(null);
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/generate-interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Generate all failed");

      const next: Record<string, { success: boolean; error?: string; count?: number }> = {};
      (data.results ?? []).forEach(
        (r: { lessonId: string; success: boolean; error?: string; count?: number }) => {
          next[r.lessonId] = { success: r.success, error: r.error, count: r.count };
        }
      );
      setResults(next);
      loadCourse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate all failed");
    } finally {
      setGeneratingAll(false);
    }
  }

  function toggleType(type: InteractionBlockType) {
    setConfig((prev) => {
      const types = prev.enabledTypes.includes(type)
        ? prev.enabledTypes.filter((t) => t !== type)
        : [...prev.enabledTypes, type];
      return { ...prev, enabledTypes: types.length > 0 ? types : [type] };
    });
  }

  function setDensity(density: InteractionDensity) {
    setConfig((prev) => ({ ...prev, density }));
  }

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-3rem)] p-8">
        <LoadingLines />
      </main>
    );
  }

  if (error && !course) {
    return (
      <main className="min-h-[calc(100vh-3rem)] p-8">
        <p className="mt-4 text-red-600">{error}</p>
      </main>
    );
  }

  const ilos = Array.isArray(course?.ilos) ? course.ilos : [];
  const assessmentPlan =
    typeof course?.assessmentPlan === "string" ? course.assessmentPlan : null;

  return (
    <main className="min-h-[calc(100vh-3rem)] p-8">
      <div className="mx-auto max-w-3xl">
        <div>
          <h1 className="mt-2 text-2xl font-bold">Generate Interactions</h1>
          <p className="mt-1 text-sm text-gray-500">{course?.title}</p>
        </div>

        <p className="mt-4 text-gray-600">
          Generate quizzes, knowledge checks, and reflection prompts for your lessons. Interactions
          are based on the lesson content and aligned to your learning outcomes.
        </p>

        {error && <p className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

        {/* Strategy Panel */}
        <section className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Interaction Strategy</h2>
            <Link
              href={`/courses/${courseId}/blueprint`}
              className="text-sm text-brand-600 hover:underline"
            >
              Edit in Blueprint
            </Link>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700">Learning Outcomes (ILOs)</h3>
            {ilos.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                {ilos.map((ilo, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-gray-400">•</span>
                    <span>{ilo}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500 italic">
                No learning outcomes defined.{" "}
                <Link href={`/courses/${courseId}/blueprint`} className="text-brand-600 hover:underline">
                  Add them in Blueprint
                </Link>
              </p>
            )}
          </div>

          {assessmentPlan && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700">Assessment Plan</h3>
              <p className="mt-2 text-sm text-gray-600">{assessmentPlan}</p>
            </div>
          )}
        </section>

        {/* Settings Panel */}
        <section className="mt-6 rounded-lg border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900">Generation Settings</h2>

          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700">Interaction Types</h3>
            <p className="mt-1 text-xs text-gray-500">
              Graded: Multiple Choice, True/False, Drag &amp; Drop, Matching. Non-graded: Reflections, Dialog Cards.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {ALL_INTERACTION_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.enabledTypes.includes(type)}
                    onChange={() => toggleType(type)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>{INTERACTION_TYPE_LABELS[type]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700">Density</h3>
            <div className="mt-2 space-y-2">
              {(["light", "moderate", "heavy"] as const).map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="density"
                    checked={config.density === d}
                    onChange={() => setDensity(d)}
                    className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    {d === "light"
                      ? "Light — 1 interaction per lesson"
                      : d === "moderate"
                        ? "Moderate — 2 interactions per lesson"
                        : "Heavy — 3 interactions per lesson"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.includeExplanations}
                onChange={() =>
                  setConfig((prev) => ({ ...prev, includeExplanations: !prev.includeExplanations }))
                }
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Include explanations for correct/incorrect answers</span>
            </label>
          </div>
        </section>

        {/* Lessons List */}
        {lessonsWithContent.length === 0 ? (
          <p className="mt-6 text-gray-500">
            No lessons have content yet.{" "}
            <Link href={`/courses/${courseId}/generate`} className="text-brand-600 hover:underline">
              Generate lesson content first
            </Link>
          </p>
        ) : (
          <>
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {lessonsWithoutInteractions.length === 0
                  ? "All lessons have interactions."
                  : `${lessonsWithoutInteractions.length} lesson${lessonsWithoutInteractions.length !== 1 ? "s" : ""} need interactions.`}
              </p>
              <button
                type="button"
                onClick={generateAll}
                disabled={generatingAll || generatingId !== null || lessonsWithoutInteractions.length === 0}
                className="rounded bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {generatingAll ? "Generating…" : "Generate all"}
              </button>
            </div>

            <ul className="mt-4 space-y-2">
              {lessonsWithContent.map((les) => (
                <li
                  key={les.id}
                  className="flex items-center justify-between rounded border border-gray-200 bg-gray-50/50 px-4 py-3"
                >
                  <div>
                    <span className="font-medium">{les.title}</span>
                    <span className="ml-2 text-xs text-gray-500">{les.moduleTitle}</span>
                    {les.interactionCount > 0 && (
                      <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        {les.interactionCount} interaction{les.interactionCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {results[les.id] && (
                      <span
                        className={
                          results[les.id].success ? "text-sm text-green-600" : "text-sm text-red-600"
                        }
                      >
                        {results[les.id].success
                          ? `+${results[les.id].count ?? 0}`
                          : results[les.id].error ?? "Failed"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => generateOne(les.id)}
                      disabled={generatingId !== null || generatingAll}
                      className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
                    >
                      {generatingId === les.id ? "…" : les.interactionCount > 0 ? "Add more" : "Generate"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-10 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/courses/${courseId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ interactionsReviewedAt: new Date().toISOString() }),
              });
              window.location.href = `/courses/${courseId}/review`;
            }}
            className="rounded bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
          >
            Review course →
          </button>
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
