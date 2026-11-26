"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ModuleApiResponse } from "@/lib/api";
import { getModuleStats } from "@/lib/course-tree";
import { useConfirm, useToast } from "@/components/ui";

export function ModuleCard({
  courseId,
  module: mod,
  onDeleted,
}: {
  courseId: string;
  module: ModuleApiResponse;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const confirm = useConfirm();
  const toast = useToast();

  const stats = getModuleStats(mod);
  const lessons = mod.lessons ?? [];

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this module?",
      message: `"${mod.title}" and all its lessons and pages will be deleted. This can't be undone.`,
      confirmLabel: "Delete module",
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/modules/${mod.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted?.();
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ message: (data as { error?: string }).error || "Failed to delete", tone: "error" });
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/modules/${mod.id}/duplicate`, {
        method: "POST",
      });
      if (res.ok) router.refresh();
      else {
        const data = await res.json().catch(() => ({}));
        toast({ message: (data as { error?: string }).error || "Failed to duplicate", tone: "error" });
      }
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900">{mod.title}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {stats.lessonCount} {stats.lessonCount === 1 ? "lesson" : "lessons"} · {stats.pageCount}{" "}
              {stats.pageCount === 1 ? "page" : "pages"} · {stats.interactionCount}{" "}
              {stats.interactionCount === 1 ? "interaction" : "interactions"} · {stats.completionPercent}%
              complete
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="rounded border border-gray-300 bg-surface px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
            <Link
              href={`/courses/${courseId}/edit`}
              className="rounded border border-gray-300 bg-surface px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Edit
            </Link>
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={duplicating}
              className="rounded border border-gray-300 bg-surface px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {duplicating ? "…" : "Duplicate"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded border border-red-200 bg-surface px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "…" : "Delete"}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Lessons
            </p>
            <ul className="space-y-2">
              {lessons.length === 0 ? (
                <li className="text-sm text-gray-500">No lessons</li>
              ) : (
                lessons.map((lesson) => (
                  <li key={lesson.id} className="rounded border border-gray-100 bg-gray-50/50 p-2">
                    <span className="font-medium text-gray-800">{lesson.title}</span>
                    <span className="ml-2 text-sm text-gray-500">
                      {(lesson.pages?.length ?? 0)} pages
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
