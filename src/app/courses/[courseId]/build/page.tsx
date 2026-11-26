"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CheckIcon,
  ExclamationCircleIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import type { CourseApiResponse } from "@/lib/api";
import { fetchCourse } from "@/lib/api";
import { useUnsavedChanges } from "@/lib/use-unsaved-changes";
import {
  Button,
  ButtonLink,
  Card,
  ErrorNote,
  PageSkeleton,
  Spinner,
  useConfirm,
} from "@/components/ui";

interface OutlineLesson {
  /** Set once the lesson exists, so saving keeps its content. */
  id?: string;
  /** Stable React key for rows that have no id yet. */
  key: string;
  title: string;
}
interface OutlineModule {
  id?: string;
  key: string;
  title: string;
  lessons: OutlineLesson[];
}

type Step = "outline" | "options" | "build";
type Density = "light" | "moderate" | "heavy";

type LessonRun =
  | { state: "waiting" }
  | { state: "text" }
  | { state: "interactions" }
  | { state: "done" }
  | { state: "skipped" }
  | { state: "failed"; error: string };

const STEPS: { id: Step; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "options", label: "Options" },
  { id: "build", label: "Build" },
];

const DENSITY: Record<Density, { label: string; count: number }> = {
  light: { label: "One per lesson", count: 1 },
  moderate: { label: "Two per lesson", count: 2 },
  heavy: { label: "Three per lesson", count: 3 },
};

let keySeed = 0;
const newKey = () => `row-${++keySeed}`;

function fromCourse(course: CourseApiResponse): OutlineModule[] {
  return [...course.modules]
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      id: m.id,
      key: m.id,
      title: m.title,
      lessons: [...m.lessons]
        .sort((a, b) => a.order - b.order)
        .map((l) => ({ id: l.id, key: l.id, title: l.title })),
    }));
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * The guided way to build a course with AI: draft an outline, let the author
 * edit and approve it, choose what to build, then write the lessons one at a
 * time. Nothing is written into a lesson before the outline is approved, and
 * lessons that already have content are never overwritten here.
 */
export default function BuildPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const confirm = useConfirm();

  const [course, setCourse] = useState<CourseApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("outline");
  const [error, setError] = useState<string | null>(null);

  // Outline step
  const [modules, setModules] = useState<OutlineModule[]>([]);
  const [ilos, setIlos] = useState<string[]>([]);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [savedOutline, setSavedOutline] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const autoDrafted = useRef(false);

  // Options step
  const [addInteractions, setAddInteractions] = useState(true);
  const [density, setDensity] = useState<Density>("moderate");

  // Build step
  const [runs, setRuns] = useState<Record<string, LessonRun>>({});
  const [building, setBuilding] = useState(false);
  const [finished, setFinished] = useState(false);
  const stopRef = useRef(false);

  const outlineSignature = JSON.stringify([modules.map((m) => [m.id, m.title, m.lessons.map((l) => [l.id, l.title])]), ilos]);
  const outlineDirty = savedOutline !== null && outlineSignature !== savedOutline;
  useUnsavedChanges((step === "outline" && outlineDirty) || building);

  const load = useCallback(async () => {
    try {
      const data = await fetchCourse(courseId);
      setCourse(data);
      setModules(fromCourse(data));
      setIlos(Array.isArray(data.ilos) ? data.ilos : []);
      setSavedOutline(null);
      return data;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load the course");
      return null;
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  // After a load, the outline as it stands is the saved one.
  useEffect(() => {
    if (course && savedOutline === null) setSavedOutline(outlineSignature);
  }, [course, savedOutline, outlineSignature]);

  /** Asks the AI for learning outcomes, modules and lessons, in that order. */
  const draftOutline = useCallback(async () => {
    setError(null);
    const base = `/api/courses/${courseId}/blueprint/generate`;
    try {
      setDrafting("Writing learning outcomes…");
      const outcomes = await postJson<{ ilos?: string[] }>(base, { section: "ilos" });
      const nextIlos = outcomes.ilos ?? [];
      setIlos(nextIlos);

      setDrafting("Planning the modules…");
      const mods = await postJson<{ modules?: { title: string }[] }>(base, {
        section: "modules",
        currentBlueprint: { ilos: nextIlos },
      });
      const moduleTitles = (mods.modules ?? []).map((m) => ({ title: m.title }));
      setModules(moduleTitles.map((m) => ({ key: newKey(), title: m.title, lessons: [] })));

      setDrafting("Planning the lessons…");
      const les = await postJson<{ lessons?: { moduleIndex: number; title: string }[] }>(base, {
        section: "lessons",
        currentBlueprint: { ilos: nextIlos, modules: moduleTitles },
      });
      setModules(
        moduleTitles.map((m, i) => ({
          key: newKey(),
          title: m.title,
          lessons: (les.lessons ?? [])
            .filter((l) => l.moduleIndex === i)
            .map((l) => ({ key: newKey(), title: l.title })),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft the outline");
    } finally {
      setDrafting(null);
    }
  }, [courseId]);

  // A brand-new course gets a first draft without being asked.
  useEffect(() => {
    if (!course || autoDrafted.current) return;
    autoDrafted.current = true;
    if (course.modules.length === 0) void draftOutline();
  }, [course, draftOutline]);

  async function redraft() {
    if (modules.length > 0) {
      const hasSaved = modules.some((m) => m.id);
      const ok = await confirm({
        title: "Draft a new outline?",
        message: hasSaved
          ? "The outline on screen is replaced with a new draft. Nothing is deleted from the course until you approve the new outline, and you'll be asked again then."
          : "The outline on screen is replaced with a new draft.",
        confirmLabel: "Draft again",
      });
      if (!ok) return;
    }
    await draftOutline();
  }

  function updateModule(mi: number, patch: Partial<OutlineModule>) {
    setModules((prev) => prev.map((m, i) => (i === mi ? { ...m, ...patch } : m)));
  }
  function moveModule(mi: number, to: number) {
    setModules((prev) => {
      const next = [...prev];
      [next[mi], next[to]] = [next[to], next[mi]];
      return next;
    });
  }
  function moveLesson(mi: number, li: number, to: number) {
    const lessons = [...modules[mi].lessons];
    [lessons[li], lessons[to]] = [lessons[to], lessons[li]];
    updateModule(mi, { lessons });
  }

  const lessonCount = modules.reduce((n, m) => n + m.lessons.filter((l) => l.title.trim()).length, 0);

  /** Saves the outline. Existing lessons keep their content. */
  async function approveOutline() {
    const kept = modules.filter((m) => m.title.trim());
    if (kept.length === 0 || lessonCount === 0) {
      setError("Add at least one module with one lesson.");
      return;
    }
    const keptModuleIds = new Set(kept.map((m) => m.id));
    const keptLessonIds = new Set(kept.flatMap((m) => m.lessons.filter((l) => l.title.trim()).map((l) => l.id)));
    const existing = course?.modules ?? [];
    const removedModules = existing.filter((m) => !keptModuleIds.has(m.id)).length;
    const removedLessons = existing.flatMap((m) => m.lessons).filter((l) => !keptLessonIds.has(l.id)).length;
    if (removedModules > 0 || removedLessons > 0) {
      const ok = await confirm({
        title: "Remove lessons that are no longer in the outline?",
        message: `${removedModules} module${removedModules === 1 ? "" : "s"} and ${removedLessons} lesson${removedLessons === 1 ? "" : "s"} already in the course are not in this outline. Approving deletes them and their content. A version is saved to History first.`,
        confirmLabel: "Approve and remove",
        danger: true,
      });
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      await postJson(`/api/courses/${courseId}/blueprint/apply`, {
        ilos: ilos.map((i) => i.trim()).filter(Boolean),
        modules: kept.map((m) => ({
          id: m.id,
          title: m.title.trim(),
          lessons: m.lessons.filter((l) => l.title.trim()).map((l) => ({ id: l.id, title: l.title.trim() })),
        })),
      });
      await load();
      setStep("options");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the outline");
    } finally {
      setSaving(false);
    }
  }

  const savedLessons = (course?.modules ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((m) =>
      [...m.lessons]
        .sort((a, b) => a.order - b.order)
        .map((l) => ({
          id: l.id,
          title: l.title,
          moduleTitle: m.title,
          hasContent: l.pages.some((p) => p.blocks.some((b) => b.category === "content")),
          hasInteractions: l.pages.some((p) => p.blocks.some((b) => b.category === "interaction")),
        }))
    );
  const toWrite = savedLessons.filter((l) => !l.hasContent);

  async function build() {
    setStep("build");
    setBuilding(true);
    setFinished(false);
    stopRef.current = false;
    const initial: Record<string, LessonRun> = {};
    savedLessons.forEach((l) => {
      initial[l.id] = { state: l.hasContent && (!addInteractions || l.hasInteractions) ? "skipped" : "waiting" };
    });
    setRuns(initial);
    const set = (id: string, run: LessonRun) => setRuns((prev) => ({ ...prev, [id]: run }));

    for (const lesson of savedLessons) {
      if (stopRef.current) break;
      if (initial[lesson.id].state === "skipped") continue;
      try {
        if (!lesson.hasContent) {
          set(lesson.id, { state: "text" });
          await postJson(`/api/courses/${courseId}/lessons/${lesson.id}/generate-pages`, {});
        }
        if (addInteractions && !lesson.hasInteractions && !stopRef.current) {
          set(lesson.id, { state: "interactions" });
          await postJson(`/api/courses/${courseId}/lessons/${lesson.id}/generate-interactions`, {
            count: DENSITY[density].count,
          });
        }
        set(lesson.id, { state: "done" });
      } catch (e) {
        set(lesson.id, { state: "failed", error: e instanceof Error ? e.message : "Failed" });
      }
    }
    setBuilding(false);
    setFinished(true);
    void load();
  }

  if (loadError) {
    return (
      <main className="p-8">
        <ErrorNote>{loadError}</ErrorNote>
      </main>
    );
  }
  if (!course) return <PageSkeleton label="Loading the course" />;

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const runList = Object.values(runs);
  const doneCount = runList.filter((r) => r.state === "done" || r.state === "failed").length;
  const workCount = runList.filter((r) => r.state !== "skipped").length;
  const failedCount = runList.filter((r) => r.state === "failed").length;

  return (
    <main className="min-h-[calc(100vh-3rem)] p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Build with AI</h1>
        <p className="mt-1 text-sm text-gray-500">{course.title}</p>

        <ol className="mt-6 flex items-center gap-2 text-sm" aria-label="Steps">
          {STEPS.map((s, i) => {
            const current = i === stepIndex;
            const past = i < stepIndex;
            // Earlier steps can be revisited, but not while lessons are being written.
            const canOpen = past && !building;
            return (
              <li key={s.id} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-6 bg-gray-300" aria-hidden="true" />}
                <button
                  type="button"
                  disabled={!canOpen}
                  onClick={() => setStep(s.id)}
                  aria-current={current ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-full px-3 py-1 font-medium ${
                    current
                      ? "bg-brand-600 text-white"
                      : past
                        ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
                        : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {past ? <CheckIcon className="h-4 w-4" /> : <span>{i + 1}</span>}
                  {s.label}
                </button>
              </li>
            );
          })}
        </ol>

        {error && <ErrorNote className="mt-6">{error}</ErrorNote>}

        {step === "outline" && (
          <section className="mt-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-xl text-sm text-gray-600">
                This is the plan for the course. Rename, reorder, add or remove anything. Lessons
                are only written after you approve it.
              </p>
              <Button variant="secondary" size="sm" onClick={redraft} disabled={drafting !== null || saving}>
                {modules.length === 0 ? "Draft an outline" : "Draft again"}
              </Button>
            </div>

            {drafting ? (
              <Card className="flex items-center gap-3 p-5 text-sm text-gray-700">
                <Spinner className="h-5 w-5 text-brand-600" />
                <span role="status">{drafting}</span>
              </Card>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-900">Learning outcomes</h2>
                    <Button variant="ghost" size="sm" onClick={() => setIlos((prev) => [...prev, ""])}>
                      <PlusIcon className="h-4 w-4" />
                      Add outcome
                    </Button>
                  </div>
                  {ilos.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-500">None yet. They guide what each lesson covers.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {ilos.map((ilo, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <input
                            value={ilo}
                            onChange={(e) => setIlos((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                            aria-label={`Learning outcome ${i + 1}`}
                            placeholder="By the end of this course, learners can…"
                            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                          <IconButton
                            label={`Remove outcome ${i + 1}`}
                            onClick={() => setIlos((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </IconButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Modules and lessons</h2>
                  <div className="mt-2 space-y-3">
                    {modules.map((mod, mi) => (
                      <Card key={mod.key} className="p-3">
                        <div className="flex items-center gap-1">
                          <span className="w-6 shrink-0 text-center text-xs font-medium text-gray-400">{mi + 1}</span>
                          <input
                            value={mod.title}
                            onChange={(e) => updateModule(mi, { title: e.target.value })}
                            aria-label={`Module ${mi + 1} title`}
                            placeholder="Module title"
                            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                          <IconButton label={`Move module ${mi + 1} up`} disabled={mi === 0} onClick={() => moveModule(mi, mi - 1)}>
                            <ArrowUpIcon className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={`Move module ${mi + 1} down`}
                            disabled={mi === modules.length - 1}
                            onClick={() => moveModule(mi, mi + 1)}
                          >
                            <ArrowDownIcon className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={`Remove module ${mi + 1}`}
                            onClick={() => setModules((prev) => prev.filter((_, i) => i !== mi))}
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </IconButton>
                        </div>
                        <ul className="mt-2 space-y-1.5 pl-7">
                          {mod.lessons.map((lesson, li) => (
                            <li key={lesson.key} className="flex items-center gap-1">
                              <input
                                value={lesson.title}
                                onChange={(e) =>
                                  updateModule(mi, {
                                    lessons: mod.lessons.map((l, j) => (j === li ? { ...l, title: e.target.value } : l)),
                                  })
                                }
                                aria-label={`Module ${mi + 1}, lesson ${li + 1} title`}
                                placeholder="Lesson title"
                                className="min-w-0 flex-1 rounded-md border border-gray-200 bg-surface px-3 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                              <IconButton
                                label={`Move lesson ${li + 1} up`}
                                disabled={li === 0}
                                onClick={() => moveLesson(mi, li, li - 1)}
                              >
                                <ArrowUpIcon className="h-4 w-4" />
                              </IconButton>
                              <IconButton
                                label={`Move lesson ${li + 1} down`}
                                disabled={li === mod.lessons.length - 1}
                                onClick={() => moveLesson(mi, li, li + 1)}
                              >
                                <ArrowDownIcon className="h-4 w-4" />
                              </IconButton>
                              <IconButton
                                label={`Remove lesson ${li + 1}`}
                                onClick={() => updateModule(mi, { lessons: mod.lessons.filter((_, j) => j !== li) })}
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </IconButton>
                            </li>
                          ))}
                          <li>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateModule(mi, { lessons: [...mod.lessons, { key: newKey(), title: "" }] })}
                            >
                              <PlusIcon className="h-4 w-4" />
                              Add lesson
                            </Button>
                          </li>
                        </ul>
                      </Card>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setModules((prev) => [...prev, { key: newKey(), title: "", lessons: [] }])}
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add module
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5">
                  <Button onClick={approveOutline} loading={saving} disabled={lessonCount === 0}>
                    Approve outline
                  </Button>
                  <span className="text-sm text-gray-500">
                    {modules.filter((m) => m.title.trim()).length} modules, {lessonCount} lessons
                  </span>
                </div>
              </>
            )}
          </section>
        )}

        {step === "options" && (
          <section className="mt-6 space-y-6">
            <Card className="p-5">
              <h2 className="font-medium text-gray-900">Lesson text</h2>
              <p className="mt-1 text-sm text-gray-600">
                {toWrite.length === 0
                  ? "Every lesson already has content, so no text will be written."
                  : `${toWrite.length} of ${savedLessons.length} lesson${savedLessons.length === 1 ? "" : "s"} will be written. Each gets an introduction, the main content and a summary.`}
                {toWrite.length > 0 && toWrite.length < savedLessons.length &&
                  " Lessons that already have content are left as they are."}
              </p>
            </Card>

            <Card className="p-5">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={addInteractions}
                  onChange={(e) => setAddInteractions(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-gray-900">Add interactions</span>
                  <span className="mt-1 block text-sm text-gray-600">
                    Questions and activities based on each lesson&apos;s text: multiple choice, true
                    or false, ordering, matching, flip cards and reflection prompts. Lessons that
                    already have some are skipped.
                  </span>
                </span>
              </label>
              {addInteractions && (
                <fieldset className="mt-4 pl-7">
                  <legend className="text-sm font-medium text-gray-700">How many</legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {(Object.keys(DENSITY) as Density[]).map((d) => (
                      <label key={d} className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="radio" name="density" checked={density === d} onChange={() => setDensity(d)} />
                        {DENSITY[d].label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </Card>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5">
              <Button
                onClick={build}
                disabled={toWrite.length === 0 && (!addInteractions || savedLessons.every((l) => l.hasInteractions))}
              >
                Build the course
              </Button>
              <Button variant="secondary" onClick={() => setStep("outline")}>
                Back to the outline
              </Button>
              <ButtonLink href={`/courses/${courseId}/edit`} variant="ghost">
                Skip and write it myself
              </ButtonLink>
            </div>
          </section>
        )}

        {step === "build" && (
          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-700" role="status">
                {building
                  ? `Working on lesson ${Math.min(doneCount + 1, workCount)} of ${workCount}. Keep this page open.`
                  : failedCount > 0
                    ? `Finished with ${failedCount} lesson${failedCount === 1 ? "" : "s"} that couldn't be written.`
                    : stopRef.current
                      ? "Stopped. The lessons already written are saved."
                      : "The course is built."}
              </p>
              {building && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    stopRef.current = true;
                  }}
                >
                  Stop after this lesson
                </Button>
              )}
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-gray-200" aria-hidden="true">
              <div
                className="h-full bg-brand-600 transition-all"
                style={{ width: `${workCount === 0 ? 100 : (doneCount / workCount) * 100}%` }}
              />
            </div>

            <ul className="space-y-1.5">
              {savedLessons.map((lesson) => {
                const run = runs[lesson.id] ?? { state: "waiting" };
                return (
                  <li
                    key={lesson.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-surface px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-gray-900">{lesson.title}</span>
                      <span className="ml-2 text-xs text-gray-500">{lesson.moduleTitle}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs">
                      {run.state === "waiting" && <span className="text-gray-400">Waiting</span>}
                      {run.state === "skipped" && <span className="text-gray-500">Already has content</span>}
                      {(run.state === "text" || run.state === "interactions") && (
                        <>
                          <Spinner className="h-4 w-4 text-brand-600" />
                          <span className="text-brand-700">
                            {run.state === "text" ? "Writing the lesson" : "Adding interactions"}
                          </span>
                        </>
                      )}
                      {run.state === "done" && (
                        <>
                          <CheckCircleIcon className="h-4 w-4 text-green-600" />
                          <span className="text-green-700">Done</span>
                        </>
                      )}
                      {run.state === "failed" && (
                        <>
                          <ExclamationCircleIcon className="h-4 w-4 text-red-600" />
                          <span className="max-w-[16rem] truncate text-red-700" title={run.error}>
                            {run.error}
                          </span>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>

            {finished && (
              <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5">
                <ButtonLink href={`/courses/${courseId}/edit`}>Open the editor</ButtonLink>
                <ButtonLink href={`/courses/${courseId}/preview`} variant="secondary">
                  Preview the course
                </ButtonLink>
                {(failedCount > 0 || stopRef.current) && (
                  <Button variant="secondary" onClick={() => setStep("options")}>
                    Build the rest
                  </Button>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
