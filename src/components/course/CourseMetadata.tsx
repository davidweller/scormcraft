"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { CourseApiResponse } from "@/lib/api";
import { getCourseCompletion, getCourseStatus } from "@/lib/course-tree";

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} days ago`;
  return date.toLocaleDateString();
}

export function CourseMetadata({
  courseId,
  course,
}: {
  courseId: string;
  course: CourseApiResponse;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(course.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = getCourseStatus(course);
  const completion = getCourseCompletion(course);

  const handleSave = useCallback(async () => {
    const value = title.trim();
    if (value === course.title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to save");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [courseId, course.title, title, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setTitle(course.title);
      setError(null);
      setEditing(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 gap-y-1">
        {editing ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => handleSave()}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className="min-w-[200px] rounded border border-gray-300 px-2 py-1 text-2xl font-bold focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left text-2xl font-bold text-gray-900 hover:text-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 rounded"
          >
            {title}
          </button>
        )}
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            status === "ready_to_export"
              ? "bg-green-100 text-green-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {status === "ready_to_export" ? "Ready to Export" : "Draft"}
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
        <span>Last edited {formatRelativeTime(course.updatedAt)}</span>
        <span>{completion}% built</span>
        <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>
    </div>
  );
}
