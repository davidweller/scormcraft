"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CourseItem = { id: string; title: string; overview: string | null; updatedAt: string };

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CourseItem[]) => {
        if (!cancelled) setCourses(data);
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(e: React.MouseEvent, courseId: string, title: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(courseId);
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setCourses((prev) => prev?.filter((c) => c.id !== courseId) ?? null);
      }
    } catch {
      // Silently fail, user can try again
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Courses</h1>
        <Link
          href="/courses/new"
          className="rounded bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
        >
          New course
        </Link>
      </div>
      {loading ? (
        <p className="text-gray-500">Loading courses…</p>
      ) : !courses || courses.length === 0 ? (
        <p className="text-gray-600">No courses yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => (
            <li key={c.id}>
              <div className="flex items-start gap-2 rounded border border-gray-200 p-4 hover:border-brand-300 hover:bg-gray-50">
                <Link
                  href={`/courses/${c.id}`}
                  className="flex-1 min-w-0"
                >
                  <span className="font-medium">{c.title}</span>
                  {c.overview && (
                    <p className="mt-1 text-sm text-gray-600">{c.overview}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    Updated {new Date(c.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, c.id, c.title)}
                  disabled={deletingId === c.id}
                  className="shrink-0 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  title="Delete course"
                >
                  {deletingId === c.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
