"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronRightIcon,
  EyeIcon,
  ListBulletIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { fetchCourse, saveStructure, type CourseApiResponse, type ModuleApiResponse } from "@/lib/api";
import { toOutline } from "@/lib/outline";
import { ButtonLink, EmptyState, ErrorNote, PageSkeleton, useToast } from "@/components/ui";
import { CourseTree, sortOutline } from "./CourseTree";
import { PageEditor } from "./PageEditor";

export function CourseEditorShell({ selectedPageId }: { selectedPageId: string | null }) {
  const params = useParams();
  const courseId = params.courseId as string;
  const toast = useToast();
  const [course, setCourse] = useState<CourseApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);

  const refresh = useCallback(async () => {
    if (!courseId) return;
    setError(null);
    try {
      const data = await fetchCourse(courseId);
      setCourse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load course");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // On a narrow window the outline starts closed, so the page gets the room.
  useEffect(() => {
    if (window.innerWidth < 900) setOutlineOpen(false);
  }, []);

  /** Shows the rearranged outline at once, then saves it. */
  const handleStructureChange = useCallback(
    async (modules: ModuleApiResponse[]) => {
      setCourse((prev) => (prev ? { ...prev, modules } : prev));
      try {
        await saveStructure(courseId, toOutline(modules));
      } catch (e) {
        toast({ message: e instanceof Error ? e.message : "Couldn't save the outline", tone: "error" });
        await refresh();
      }
    },
    [courseId, refresh, toast]
  );

  const sorted = useMemo(() => (course ? sortOutline(course.modules) : []), [course]);

  // Where the selected page sits: its parents, and its position in the course.
  const context = useMemo(() => {
    if (!selectedPageId) return null;
    let index = 0;
    for (const mod of sorted) {
      for (const lesson of mod.lessons) {
        for (const page of lesson.pages) {
          if (page.id === selectedPageId) return { module: mod, lesson, page, index };
          index++;
        }
      }
    }
    return null;
  }, [sorted, selectedPageId]);

  if (loading) return <PageSkeleton label="Loading course" />;

  if (error || !course) {
    return (
      <div className="p-8">
        <ErrorNote>{error || "Course not found"}</ErrorNote>
        <ButtonLink href="/courses" variant="secondary" className="mt-4">
          Back to courses
        </ButtonLink>
      </div>
    );
  }

  const firstPageOf = (lessons: ModuleApiResponse["lessons"]) =>
    lessons.flatMap((l) => l.pages)[0]?.id;
  const pageHref = (id?: string) => (id ? `/courses/${courseId}/edit/page/${id}` : undefined);

  const crumbs: { label: string; href?: string }[] = [
    { label: course.title, href: `/courses/${courseId}` },
  ];
  if (context) {
    crumbs.push(
      { label: context.module.title, href: pageHref(firstPageOf(context.module.lessons)) },
      { label: context.lesson.title, href: pageHref(context.lesson.pages[0]?.id) },
      { label: context.page.title }
    );
  }

  return (
    <div className="flex">
      {outlineOpen && (
        <aside
          className="sticky top-12 flex h-[calc(100vh-3rem)] w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50"
          aria-label="Outline"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Outline</h2>
            <button
              type="button"
              onClick={() => setOutlineOpen(false)}
              aria-label="Hide the outline"
              title="Hide outline"
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <CourseTree
              courseId={courseId}
              course={course}
              selectedPageId={selectedPageId}
              onRefresh={refresh}
              onStructureChange={handleStructureChange}
            />
          </div>
        </aside>
      )}

      <main className="min-w-0 flex-1">
        <div className="sticky top-12 z-10 flex items-center gap-3 border-b border-gray-200 bg-surface/95 px-4 py-2 backdrop-blur">
          {!outlineOpen && (
            <button
              type="button"
              onClick={() => setOutlineOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ListBulletIcon className="h-4 w-4" />
              Outline
            </button>
          )}
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1 text-sm text-gray-500">
              {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={i} className={`flex items-center gap-1 ${last ? "min-w-0" : "min-w-0 shrink"}`}>
                    {i > 0 && <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300" />}
                    {crumb.href && !last ? (
                      <Link href={crumb.href} className="truncate hover:text-gray-900 hover:underline">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className={`truncate ${last ? "font-medium text-gray-900" : ""}`}
                        aria-current={last ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          {context && (
            <ButtonLink
              href={`/courses/${courseId}/preview?page=${context.index}`}
              variant="secondary"
              size="sm"
              className="shrink-0"
            >
              <EyeIcon className="h-4 w-4" />
              Preview page
            </ButtonLink>
          )}
        </div>

        <div className="p-6 pl-10">
          {context ? (
            <PageEditor
              key={context.page.id}
              courseId={courseId}
              moduleId={context.module.id}
              lessonId={context.lesson.id}
              page={context.page}
              onRefresh={refresh}
            />
          ) : (
            <EmptyState
              className="mx-auto mt-10 max-w-xl"
              title={sorted.length === 0 ? "Start with a module" : "Choose a page to edit"}
              description={
                sorted.length === 0
                  ? "A course is made of modules, each holding lessons, each holding pages. Add a module in the outline to begin."
                  : "Pick a page in the outline. Use the + beside a lesson to add a new page."
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
