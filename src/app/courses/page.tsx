"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConfirm, useToast } from "@/components/ui";

type CourseItem = { id: string; title: string; overview: string | null; updatedAt: string };

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: CourseItem[]) => {
        if (!cancelled) setCourses(data);
      })
      .catch(() => {
        if (!cancelled) {
          setCourses([]);
          setLoadFailed(true);
        }
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
    const ok = await confirm({
      title: "Delete this course?",
      message: `"${title}" and everything in it will be deleted. This can't be undone.`,
      confirmLabel: "Delete course",
      danger: true,
    });
    if (!ok) return;
    setDeletingId(courseId);
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setCourses((prev) => prev?.filter((c) => c.id !== courseId) ?? null);
        toast("Course deleted");
      } else {
        toast({ message: `Couldn't delete "${title}". Try again.`, tone: "error" });
      }
    } catch {
      toast({ message: `Couldn't delete "${title}". Try again.`, tone: "error" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-[calc(100vh-3rem)] p-8">
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
      ) : loadFailed ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Couldn&apos;t load your courses. Reload the page to try again.
        </p>
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
