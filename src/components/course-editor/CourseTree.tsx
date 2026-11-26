"use client";

import { useState } from "react";
import Link from "next/link";
import type { CourseApiResponse, ModuleApiResponse, LessonApiResponse, PageApiResponse } from "@/lib/api";
import {
  createModule,
  createLesson,
  createPage,
  updateModule,
  updateLesson,
  updatePage,
  deleteModule,
  deleteLesson,
  deletePage,
} from "@/lib/api";

export function CourseTree({
  courseId,
  course,
  selectedPageId,
  onRefresh,
}: {
  courseId: string;
  course: CourseApiResponse;
  selectedPageId: string | null;
  onRefresh: () => void;
}) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(course.modules.map((m) => m.id)));
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(() => {
    const set = new Set<string>();
    course.modules.forEach((m) => m.lessons.forEach((l) => set.add(l.id)));
    return set;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleModule(id: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLesson(id: string) {
    setExpandedLessons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(item: { id: string; title: string }) {
    setEditingId(item.id);
    setEditValue(item.title);
  }

  async function saveEdit(
    kind: "module" | "lesson" | "page",
    id: string,
    moduleId?: string,
    lessonId?: string
  ) {
    if (!editValue.trim()) {
      setEditingId(null);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (kind === "module") {
        await updateModule(courseId, id, { title: editValue.trim() });
      } else if (kind === "lesson" && moduleId) {
        await updateLesson(courseId, moduleId, id, { title: editValue.trim() });
      } else if (kind === "page" && moduleId && lessonId) {
        await updatePage(courseId, moduleId, lessonId, id, { title: editValue.trim() });
      }
      setEditingId(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddModule() {
    setError(null);
    setLoading(true);
    try {
      await createModule(courseId, { title: "New module" });
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add module");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddLesson(moduleId: string) {
    setError(null);
    setLoading(true);
    try {
      await createLesson(courseId, moduleId, { title: "New lesson" });
      onRefresh();
      setExpandedModules((prev) => new Set(prev).add(moduleId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add lesson");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPage(moduleId: string, lessonId: string) {
    setError(null);
    setLoading(true);
    try {
      await createPage(courseId, moduleId, lessonId, { title: "New page" });
      onRefresh();
      setExpandedModules((prev) => new Set(prev).add(moduleId));
      setExpandedLessons((prev) => new Set(prev).add(lessonId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add page");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteModule(moduleId: string) {
    if (!confirm("Delete this module and all its lessons and pages?")) return;
    setError(null);
    setLoading(true);
    try {
      await deleteModule(courseId, moduleId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteLesson(moduleId: string, lessonId: string) {
    if (!confirm("Delete this lesson and all its pages?")) return;
    setError(null);
    setLoading(true);
    try {
      await deleteLesson(courseId, moduleId, lessonId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePage(moduleId: string, lessonId: string, pageId: string) {
    if (!confirm("Delete this page?")) return;
    setError(null);
    setLoading(true);
    try {
      await deletePage(courseId, moduleId, lessonId, pageId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleAddModule}
        disabled={loading}
        className="text-left text-sm text-brand-600 hover:underline disabled:opacity-50"
      >
        + Add module
      </button>
      {course.modules
        .sort((a, b) => a.order - b.order)
        .map((mod) => (
          <ModuleRow
            key={mod.id}
            courseId={courseId}
            module={mod}
            expandedModules={expandedModules}
            expandedLessons={expandedLessons}
            selectedPageId={selectedPageId}
            editingId={editingId}
            editValue={editValue}
            setEditValue={setEditValue}
            onToggleModule={toggleModule}
            onToggleLesson={toggleLesson}
            onStartEdit={startEdit}
            onSaveEdit={saveEdit}
            onAddLesson={handleAddLesson}
            onAddPage={handleAddPage}
            onDeleteModule={handleDeleteModule}
            onDeleteLesson={handleDeleteLesson}
            onDeletePage={handleDeletePage}
            loading={loading}
          />
        ))}
    </div>
  );
}

function ModuleRow({
  courseId,
  module: mod,
  expandedModules,
  expandedLessons,
  selectedPageId,
  editingId,
  editValue,
  setEditValue,
  onToggleModule,
  onToggleLesson,
  onStartEdit,
  onSaveEdit,
  onAddLesson,
  onAddPage,
  onDeleteModule,
  onDeleteLesson,
  onDeletePage,
  loading,
}: {
  courseId: string;
  module: ModuleApiResponse;
  expandedModules: Set<string>;
  expandedLessons: Set<string>;
  selectedPageId: string | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onToggleModule: (id: string) => void;
  onToggleLesson: (id: string) => void;
  onStartEdit: (item: { id: string; title: string }) => void;
  onSaveEdit: (kind: "module" | "lesson" | "page", id: string, moduleId?: string, lessonId?: string) => void;
  onAddLesson: (moduleId: string) => void;
  onAddPage: (moduleId: string, lessonId: string) => void;
  onDeleteModule: (moduleId: string) => void;
  onDeleteLesson: (moduleId: string, lessonId: string) => void;
  onDeletePage: (moduleId: string, lessonId: string, pageId: string) => void;
  loading: boolean;
}) {
  const expanded = expandedModules.has(mod.id);
  return (
    <div className="border-l border-gray-200 pl-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onToggleModule(mod.id)}
          className="shrink-0 text-gray-500"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▼" : "▶"}
        </button>
        {editingId === mod.id ? (
          <input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => onSaveEdit("module", mod.id)}
            onKeyDown={(e) => e.key === "Enter" && onSaveEdit("module", mod.id)}
            className="min-w-0 flex-1 rounded border px-1 text-sm"
            autoFocus
          />
        ) : (
          <span
            className="flex-1 cursor-pointer text-sm font-medium hover:bg-gray-100"
            onClick={() => onStartEdit({ id: mod.id, title: mod.title })}
          >
            {mod.title}
          </span>
        )}
        <button
          type="button"
          onClick={() => onAddLesson(mod.id)}
          disabled={loading}
          className="text-xs text-brand-600 hover:underline disabled:opacity-50"
        >
          + Lesson
        </button>
        <button
          type="button"
          onClick={() => onDeleteModule(mod.id)}
          disabled={loading}
          className="text-xs text-red-600 hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {expanded && (
        <div className="mt-1 ml-2">
          {mod.lessons
            .sort((a, b) => a.order - b.order)
            .map((lesson) => (
              <LessonRow
                key={lesson.id}
                courseId={courseId}
                moduleId={mod.id}
                lesson={lesson}
                expandedLessons={expandedLessons}
                selectedPageId={selectedPageId}
                editingId={editingId}
                editValue={editValue}
                setEditValue={setEditValue}
                onToggleLesson={onToggleLesson}
                onStartEdit={onStartEdit}
                onSaveEdit={onSaveEdit}
                onAddPage={onAddPage}
                onDeleteLesson={onDeleteLesson}
                onDeletePage={onDeletePage}
                loading={loading}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function LessonRow({
  courseId,
  moduleId,
  lesson,
  expandedLessons,
  selectedPageId,
  editingId,
  editValue,
  setEditValue,
  onToggleLesson,
  onStartEdit,
  onSaveEdit,
  onAddPage,
  onDeleteLesson,
  onDeletePage,
  loading,
}: {
  courseId: string;
  moduleId: string;
  lesson: LessonApiResponse;
  expandedLessons: Set<string>;
  selectedPageId: string | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onToggleLesson: (id: string) => void;
  onStartEdit: (item: { id: string; title: string }) => void;
  onSaveEdit: (kind: "module" | "lesson" | "page", id: string, moduleId?: string, lessonId?: string) => void;
  onAddPage: (moduleId: string, lessonId: string) => void;
  onDeleteLesson: (moduleId: string, lessonId: string) => void;
  onDeletePage: (moduleId: string, lessonId: string, pageId: string) => void;
  loading: boolean;
}) {
  const expanded = expandedLessons.has(lesson.id);
  return (
    <div className="border-l border-gray-100 pl-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onToggleLesson(lesson.id)}
          className="shrink-0 text-gray-400"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▼" : "▶"}
        </button>
        {editingId === lesson.id ? (
          <input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => onSaveEdit("lesson", lesson.id, moduleId)}
            onKeyDown={(e) => e.key === "Enter" && onSaveEdit("lesson", lesson.id, moduleId)}
            className="min-w-0 flex-1 rounded border px-1 text-sm"
            autoFocus
          />
        ) : (
          <span
            className="flex-1 cursor-pointer text-sm hover:bg-gray-50"
            onClick={() => onStartEdit({ id: lesson.id, title: lesson.title })}
          >
            {lesson.title}
          </span>
        )}
        <button
          type="button"
          onClick={() => onAddPage(moduleId, lesson.id)}
          disabled={loading}
          className="text-xs text-brand-600 hover:underline disabled:opacity-50"
        >
          + Page
        </button>
        <button
          type="button"
          onClick={() => onDeleteLesson(moduleId, lesson.id)}
          disabled={loading}
          className="text-xs text-red-600 hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {expanded &&
        lesson.pages
          .sort((a, b) => a.order - b.order)
          .map((page) => (
            <PageRow
              key={page.id}
              courseId={courseId}
              moduleId={moduleId}
              lessonId={lesson.id}
              page={page}
              selectedPageId={selectedPageId}
              editingId={editingId}
              editValue={editValue}
              setEditValue={setEditValue}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onDeletePage={onDeletePage}
              loading={loading}
            />
          ))}
    </div>
  );
}

function PageRow({
  courseId,
  moduleId,
  lessonId,
  page,
  selectedPageId,
  editingId,
  editValue,
  setEditValue,
  onStartEdit,
  onSaveEdit,
  onDeletePage,
  loading,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  page: PageApiResponse;
  selectedPageId: string | null;
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  onStartEdit: (item: { id: string; title: string }) => void;
  onSaveEdit: (kind: "module" | "lesson" | "page", id: string, moduleId?: string, lessonId?: string) => void;
  onDeletePage: (moduleId: string, lessonId: string, pageId: string) => void;
  loading: boolean;
}) {
  const isSelected = selectedPageId === page.id;
  return (
    <div className="flex items-center gap-1 py-0.5">
      {editingId === page.id ? (
        <input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => onSaveEdit("page", page.id, moduleId, lessonId)}
          onKeyDown={(e) => e.key === "Enter" && onSaveEdit("page", page.id, moduleId, lessonId)}
          className="ml-4 min-w-0 flex-1 rounded border px-1 text-sm"
          autoFocus
        />
      ) : (
        <>
          <span className="ml-4 w-2 shrink-0" />
          <Link
            href={`/courses/${courseId}/edit/page/${page.id}`}
            className={`flex-1 text-sm hover:underline ${isSelected ? "font-medium text-brand-600" : ""}`}
          >
            {page.title}
          </Link>
        </>
      )}
      {editingId !== page.id && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onStartEdit({ id: page.id, title: page.title });
            }}
            className="text-xs text-gray-500 hover:underline"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => onDeletePage(moduleId, lessonId, page.id)}
            disabled={loading}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}
