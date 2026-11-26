"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchCourse, type CourseApiResponse } from "@/lib/api";
import { CourseTree } from "./CourseTree";
import { PageEditor } from "./PageEditor";
import { findPage } from "@/lib/course-tree";

export function CourseEditorShell({ selectedPageId }: { selectedPageId: string | null }) {
  const params = useParams();
  const courseId = params.courseId as string;
  const [course, setCourse] = useState<CourseApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center p-8">
        <p className="text-gray-500">Loading course…</p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-[calc(100vh-3rem)] p-8">
        <Link href="/courses" className="text-brand-600 hover:underline">← Courses</Link>
        <p className="mt-4 text-red-600">{error || "Course not found"}</p>
      </div>
    );
  }

  const pageContext = selectedPageId ? findPage(course, selectedPageId) : null;

  return (
    <div className="flex min-h-[calc(100vh-3rem)]">
      <aside className="w-72 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        <Link href={`/courses/${courseId}`} className="text-sm text-brand-600 hover:underline">
          ← Back to course
        </Link>
        <h2 className="mt-2 truncate text-lg font-semibold" title={course.title}>
          {course.title}
        </h2>
        <p className="mt-1 text-xs text-gray-500">Structure</p>
        <div className="mt-3">
          <CourseTree
            courseId={courseId}
            course={course}
            selectedPageId={selectedPageId}
            onRefresh={refresh}
          />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        {pageContext ? (
          <PageEditor
            courseId={courseId}
            moduleId={pageContext.module.id}
            lessonId={pageContext.lesson.id}
            page={pageContext.page}
            onRefresh={refresh}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16 text-center">
            <p className="text-gray-500">Select a page from the sidebar to edit content.</p>
            <p className="mt-1 text-sm text-gray-400">Or add a module → lesson → page first.</p>
          </div>
        )}
      </main>
    </div>
  );
}
