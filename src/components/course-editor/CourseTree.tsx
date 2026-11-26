"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Menu } from "@headlessui/react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
} from "@heroicons/react/20/solid";
import type { CourseApiResponse, ModuleApiResponse } from "@/lib/api";
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
  duplicateModule,
  duplicateOutlineItem,
} from "@/lib/api";
import { moveBy, moveNextTo, moveToParent, type OutlineKind } from "@/lib/outline";
import { useConfirm, useToast } from "@/components/ui";
import { GripIcon } from "./blocks/DragHandle";

interface Row {
  id: string;
  kind: OutlineKind;
  title: string;
  moduleId: string;
  lessonId?: string;
  /** Position among its siblings, and how many siblings there are. */
  index: number;
  siblings: number;
  hasChildren: boolean;
}

const KIND_LABEL: Record<OutlineKind, string> = { module: "module", lesson: "lesson", page: "page" };
const INDENT: Record<OutlineKind, string> = { module: "pl-0", lesson: "pl-4", page: "pl-8" };

/** Modules, lessons and pages sorted into display order. */
export function sortOutline(modules: ModuleApiResponse[]): ModuleApiResponse[] {
  return [...modules]
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      ...m,
      lessons: [...m.lessons]
        .sort((a, b) => a.order - b.order)
        .map((l) => ({ ...l, pages: [...l.pages].sort((a, b) => a.order - b.order) })),
    }));
}

/** Rewrites every `order` to match the array positions after a move. */
function renumber(modules: ModuleApiResponse[]): ModuleApiResponse[] {
  return modules.map((m, mi) => ({
    ...m,
    order: mi,
    lessons: m.lessons.map((l, li) => ({
      ...l,
      moduleId: m.id,
      order: li,
      pages: l.pages.map((p, pi) => ({ ...p, lessonId: l.id, order: pi })),
    })),
  }));
}

function MenuButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Menu.Item disabled={disabled}>
      {({ active }) => (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={`block w-full truncate px-3 py-1.5 text-left text-sm disabled:opacity-40 ${
            danger ? "text-red-600" : "text-gray-700"
          } ${active ? (danger ? "bg-red-50" : "bg-gray-100") : ""}`}
        >
          {label}
        </button>
      )}
    </Menu.Item>
  );
}

function TreeRow({
  row,
  href,
  selected,
  expanded,
  editing,
  dropLine,
  moveTargets,
  onToggle,
  onRename,
  onStartRename,
  onCancelRename,
  onAddChild,
  onMove,
  onMoveTo,
  onDuplicate,
  onDelete,
}: {
  row: Row;
  href?: string;
  selected: boolean;
  expanded: boolean;
  editing: boolean;
  dropLine: "above" | "below" | null;
  /** Other parents this row could move to. */
  moveTargets: { id: string; title: string }[];
  onToggle: () => void;
  onRename: (title: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onAddChild?: () => void;
  onMove: (direction: "up" | "down") => void;
  onMoveTo: (parentId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: row.id });
  const [draft, setDraft] = useState(row.title);
  const kind = KIND_LABEL[row.kind];
  const childKind = row.kind === "module" ? "lesson" : "page";

  return (
    <li ref={setNodeRef} className={`relative ${INDENT[row.kind]} ${isDragging ? "opacity-40" : ""}`}>
      {dropLine && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-brand-600 ${
            dropLine === "above" ? "-top-px" : "-bottom-px"
          }`}
        />
      )}
      <div
        className={`group flex min-h-[30px] items-center gap-0.5 rounded-md pr-1 ${
          selected ? "bg-brand-50 text-brand-700" : "text-gray-800 hover:bg-gray-100"
        }`}
      >
        <button
          type="button"
          className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-gray-400 opacity-0 hover:text-gray-600 focus:opacity-100 active:cursor-grabbing group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripIcon className="h-2.5 w-2.5" />
          <span className="sr-only">
            Reorder {kind} {row.title}
          </span>
        </button>

        {row.kind === "page" ? (
          <DocumentTextIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${kind} ${row.title}`}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:text-gray-800"
          >
            {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </button>
        )}

        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onRename(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename(draft);
              if (e.key === "Escape") {
                setDraft(row.title);
                onCancelRename();
              }
            }}
            aria-label={`Rename ${kind}`}
            className="min-w-0 flex-1 rounded border border-brand-400 bg-surface px-1.5 py-0.5 text-sm text-gray-900 focus:outline-none"
            autoFocus
          />
        ) : href ? (
          <Link
            href={href}
            aria-current={selected ? "page" : undefined}
            className="min-w-0 flex-1 truncate py-1 pl-1 text-sm"
            title={row.title}
          >
            {row.title}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            onDoubleClick={() => {
              setDraft(row.title);
              onStartRename();
            }}
            className={`min-w-0 flex-1 truncate py-1 pl-1 text-left text-sm ${
              row.kind === "module" ? "font-semibold" : "font-medium"
            }`}
            title={row.title}
          >
            {row.title}
          </button>
        )}

        {!editing && onAddChild && (
          <button
            type="button"
            onClick={onAddChild}
            title={`Add a ${childKind}`}
            aria-label={`Add a ${childKind} to ${row.title}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-700 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}

        {!editing && (
          <Menu as="div" className="relative shrink-0">
            <Menu.Button
              aria-label={`Actions for ${kind} ${row.title}`}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-700 focus:opacity-100 group-hover:opacity-100 data-[open]:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <EllipsisHorizontalIcon className="h-4 w-4" />
            </Menu.Button>
            <Menu.Items className="absolute right-0 top-full z-30 mt-1 max-h-80 w-52 overflow-y-auto rounded-md border border-gray-200 bg-surface py-1 shadow-lg focus:outline-none">
              <MenuButton
                label="Rename"
                onClick={() => {
                  setDraft(row.title);
                  onStartRename();
                }}
              />
              {onAddChild && <MenuButton label={`Add a ${childKind}`} onClick={onAddChild} />}
              <MenuButton label="Duplicate" onClick={onDuplicate} />
              <div className="my-1 border-t border-gray-100" />
              <MenuButton label="Move up" onClick={() => onMove("up")} />
              <MenuButton label="Move down" onClick={() => onMove("down")} />
              {moveTargets.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Move to {row.kind === "lesson" ? "module" : "lesson"}
                  </p>
                  {moveTargets.map((t) => (
                    <MenuButton key={t.id} label={t.title} onClick={() => onMoveTo(t.id)} />
                  ))}
                </>
              )}
              <div className="my-1 border-t border-gray-100" />
              <MenuButton label="Delete" danger onClick={onDelete} />
            </Menu.Items>
          </Menu>
        )}
      </div>
    </li>
  );
}

export function CourseTree({
  courseId,
  course,
  selectedPageId,
  onRefresh,
  onStructureChange,
}: {
  courseId: string;
  course: CourseApiResponse;
  selectedPageId: string | null;
  onRefresh: () => void | Promise<void>;
  /** Shows a rearranged outline at once and saves it. */
  onStructureChange: (modules: ModuleApiResponse[]) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const modules = useMemo(() => sortOutline(course.modules), [course.modules]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    modules.forEach((mod, mi) => {
      out.push({
        id: mod.id,
        kind: "module",
        title: mod.title,
        moduleId: mod.id,
        index: mi,
        siblings: modules.length,
        hasChildren: mod.lessons.length > 0,
      });
      if (collapsed.has(mod.id)) return;
      mod.lessons.forEach((lesson, li) => {
        out.push({
          id: lesson.id,
          kind: "lesson",
          title: lesson.title,
          moduleId: mod.id,
          lessonId: lesson.id,
          index: li,
          siblings: mod.lessons.length,
          hasChildren: lesson.pages.length > 0,
        });
        if (collapsed.has(lesson.id)) return;
        lesson.pages.forEach((page, pi) => {
          out.push({
            id: page.id,
            kind: "page",
            title: page.title,
            moduleId: mod.id,
            lessonId: lesson.id,
            index: pi,
            siblings: lesson.pages.length,
            hasChildren: false,
          });
        });
      });
    });
    return out;
  }, [modules, collapsed]);

  const allLessons = useMemo(
    () => modules.flatMap((m) => m.lessons.map((l) => ({ id: l.id, title: l.title }))),
    [modules]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expand(...ids: string[]) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  function fail(e: unknown, fallback: string) {
    toast({ message: e instanceof Error ? e.message : fallback, tone: "error" });
  }

  function commit(next: ModuleApiResponse[] | null) {
    if (next) onStructureChange(renumber(next));
  }

  /** Where the dragged row would land, given the row it is over. */
  function resolveDrop(active: string, over: string) {
    const from = rows.findIndex((r) => r.id === active);
    const to = rows.findIndex((r) => r.id === over);
    if (from === -1 || to === -1 || from === to) return null;
    const place = from > to ? ("before" as const) : ("after" as const);
    const a = rows[from];
    const o = rows[to];
    let targetId = o.id;

    // Dropping just above a header means the end of whatever comes before it,
    // not the end of that header's own children.
    if (place === "before") {
      if (a.kind === "lesson" && o.kind === "module") {
        const previous = modules[modules.findIndex((m) => m.id === o.id) - 1];
        if (!previous) return null;
        targetId = previous.id;
      }
      if (a.kind === "page" && o.kind === "lesson") {
        const previous = allLessons[allLessons.findIndex((l) => l.id === o.id) - 1];
        if (!previous) return null;
        targetId = previous.id;
      }
    }
    const next = moveNextTo(modules, active, targetId, place);
    return next ? { next, place } : null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (!over) return;
    const drop = resolveDrop(String(active.id), String(over.id));
    if (drop) commit(drop.next);
  }

  async function rename(row: Row, title: string) {
    setEditingId(null);
    const value = title.trim();
    if (!value || value === row.title) return;
    try {
      if (row.kind === "module") await updateModule(courseId, row.id, { title: value });
      else if (row.kind === "lesson") await updateLesson(courseId, row.moduleId, row.id, { title: value });
      else await updatePage(courseId, row.moduleId, row.lessonId!, row.id, { title: value });
      await onRefresh();
    } catch (e) {
      fail(e, "Couldn't rename");
    }
  }

  async function addModule() {
    setBusy(true);
    try {
      const created = await createModule(courseId, { title: "New module" });
      await onRefresh();
      setEditingId(created.id);
    } catch (e) {
      fail(e, "Couldn't add a module");
    } finally {
      setBusy(false);
    }
  }

  async function addChild(row: Row) {
    setBusy(true);
    try {
      if (row.kind === "module") {
        const created = await createLesson(courseId, row.id, { title: "New lesson" });
        expand(row.id);
        await onRefresh();
        setEditingId(created.id);
      } else if (row.kind === "lesson") {
        const created = await createPage(courseId, row.moduleId, row.id, { title: "New page" });
        expand(row.moduleId, row.id);
        await onRefresh();
        router.push(`/courses/${courseId}/edit/page/${created.id}`);
      }
    } catch (e) {
      fail(e, "Couldn't add it");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(row: Row) {
    setBusy(true);
    try {
      if (row.kind === "module") await duplicateModule(courseId, row.id);
      else await duplicateOutlineItem(courseId, row.kind, row.id);
      await onRefresh();
      toast(`Duplicated "${row.title}"`);
    } catch (e) {
      fail(e, "Couldn't duplicate");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: Row) {
    const inside =
      row.kind === "module"
        ? " and all its lessons and pages"
        : row.kind === "lesson"
          ? " and all its pages"
          : "";
    const ok = await confirm({
      title: `Delete this ${KIND_LABEL[row.kind]}?`,
      message: `"${row.title}"${inside} will be deleted. This can't be undone.`,
      confirmLabel: `Delete ${KIND_LABEL[row.kind]}`,
      danger: true,
    });
    if (!ok) return;

    // If the open page is about to go, leave it first.
    const mod = modules.find((m) => m.id === row.moduleId);
    const doomedPages =
      row.kind === "page"
        ? [row.id]
        : row.kind === "lesson"
          ? (mod?.lessons.find((l) => l.id === row.id)?.pages ?? []).map((p) => p.id)
          : (mod?.lessons ?? []).flatMap((l) => l.pages.map((p) => p.id));

    setBusy(true);
    try {
      if (row.kind === "module") await deleteModule(courseId, row.id);
      else if (row.kind === "lesson") await deleteLesson(courseId, row.moduleId, row.id);
      else await deletePage(courseId, row.moduleId, row.lessonId!, row.id);
      if (selectedPageId && doomedPages.includes(selectedPageId)) {
        router.push(`/courses/${courseId}/edit`);
      }
      await onRefresh();
    } catch (e) {
      fail(e, "Couldn't delete");
    } finally {
      setBusy(false);
    }
  }

  const activeRow = activeId ? rows.find((r) => r.id === activeId) : null;
  const drop = activeId && overId ? resolveDrop(activeId, overId) : null;

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragOver={(e) => setOverId(e.over ? String(e.over.id) : null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverId(null);
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To reorder, press space or enter on the handle, use the up and down arrow keys, then press space or enter to drop. Press escape to cancel. Each row's actions menu also has Move up, Move down and Move to.",
          },
        }}
      >
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-px" aria-label="Course outline">
            {rows.map((row) => (
              <TreeRow
                key={row.id}
                row={row}
                href={row.kind === "page" ? `/courses/${courseId}/edit/page/${row.id}` : undefined}
                selected={row.id === selectedPageId}
                expanded={!collapsed.has(row.id)}
                editing={editingId === row.id}
                dropLine={
                  drop && overId === row.id ? (drop.place === "before" ? "above" : "below") : null
                }
                moveTargets={
                  row.kind === "lesson"
                    ? modules.filter((m) => m.id !== row.moduleId).map((m) => ({ id: m.id, title: m.title }))
                    : row.kind === "page"
                      ? allLessons.filter((l) => l.id !== row.lessonId)
                      : []
                }
                onToggle={() => toggle(row.id)}
                onStartRename={() => setEditingId(row.id)}
                onCancelRename={() => setEditingId(null)}
                onRename={(title) => void rename(row, title)}
                onAddChild={row.kind === "page" || busy ? undefined : () => void addChild(row)}
                onMove={(direction) => commit(moveBy(modules, row.id, direction))}
                onMoveTo={(parentId) => {
                  commit(moveToParent(modules, row.id, parentId));
                  expand(parentId);
                }}
                onDuplicate={() => void duplicate(row)}
                onDelete={() => void remove(row)}
              />
            ))}
          </ul>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeRow && (
            <div className="flex w-56 cursor-grabbing items-center gap-2 rounded-md border border-gray-300 bg-surface px-2 py-1.5 text-sm shadow-lg">
              <GripIcon className="h-2.5 w-2.5 shrink-0 text-gray-400" />
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {KIND_LABEL[activeRow.kind]}
              </span>
              <span className="truncate text-gray-800">{activeRow.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {rows.length === 0 && (
        <p className="px-1 py-2 text-sm text-gray-500">
          No modules yet. A course is made of modules, each holding lessons, each holding pages.
        </p>
      )}

      <button
        type="button"
        onClick={() => void addModule()}
        disabled={busy}
        className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-100 disabled:opacity-50"
      >
        <PlusIcon className="h-4 w-4" />
        Add module
      </button>
    </div>
  );
}
