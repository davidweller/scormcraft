"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Menu } from "@headlessui/react";
import { PlusIcon } from "@heroicons/react/20/solid";
import type { BlockApiResponse } from "@/lib/api";
import { createBlock, deleteBlock, reorderBlocks, regenerateBlock, updateBlock } from "@/lib/api";
import { Button, Dialog, useConfirm, useToast } from "@/components/ui";
import { BlockEditor } from "./BlockEditor";
import { BlockPreview, blockSnippet, REGENERABLE_BLOCK_TYPES } from "./BlockPreview";
import { blockTypeLabel } from "./BlockWrap";
import { GripIcon } from "./DragHandle";
import {
  AUTHORABLE_CONTENT_BLOCK_TYPES,
  BLOCK_TYPE_LABELS,
  INTERACTION_BLOCK_TYPES,
  isSystemBlockType,
} from "@/types/course";
import type { ContentBlockType, InteractionBlockType } from "@/types/course";

type Category = "content" | "interaction";

interface SortableBlockProps {
  block: BlockApiResponse;
  /** Changes when the block's data is replaced from outside, to reset the editor. */
  editorKey: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  pageId: string;
  onRefresh: () => void;
  onDelete: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onMove: (to: "up" | "down" | "top") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  flash: boolean;
  /** Where the dragged block would land relative to this one. */
  dropLine: "above" | "below" | null;
}

function SortableBlock({ block, editorKey, dropLine, ...rest }: SortableBlockProps) {
  // No transform is applied here on purpose. The blocks stay still during a
  // drag: a small card follows the pointer and a line marks the landing spot.
  // Transforming the real blocks is what used to stretch them.
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: block.id });

  return (
    <div ref={setNodeRef} className="relative">
      {dropLine && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -left-1 right-0 z-10 flex items-center ${
            dropLine === "above" ? "-top-[9px]" : "-bottom-[9px]"
          }`}
        >
          <span className="h-2 w-2 rounded-full border-2 border-brand-600 bg-surface" />
          <span className="h-0.5 flex-1 bg-brand-600" />
        </div>
      )}
      <BlockEditor
        key={editorKey}
        block={block}
        dragAttributes={attributes}
        dragListeners={listeners}
        isDragging={isDragging}
        {...rest}
      />
    </div>
  );
}

const INTERACTION_MENU_ORDER: InteractionBlockType[] = [
  "multiple_choice",
  "true_false",
  "drag_and_drop",
  "matching",
  "reflection",
  "dialog_cards",
];

// Derived from the canonical registry in types/course.ts, so a new block type
// never has to be added here as well. System types (embedded_html) are excluded
// from AUTHORABLE_CONTENT_BLOCK_TYPES and so never appear in the menu.
const CONTENT_TYPES: { type: ContentBlockType; label: string }[] =
  AUTHORABLE_CONTENT_BLOCK_TYPES.map((type) => ({ type, label: BLOCK_TYPE_LABELS[type] }));

const INTERACTION_TYPES: { type: InteractionBlockType; label: string }[] =
  INTERACTION_MENU_ORDER.filter((t) => INTERACTION_BLOCK_TYPES.includes(t)).map((type) => ({
    type,
    label: BLOCK_TYPE_LABELS[type],
  }));

function getDefaultData(category: Category, type: string): Record<string, unknown> {
  // Fail loudly if a refactor ever routes a system block type through the
  // creation path: there is no valid default for a preserved-page reference.
  if (isSystemBlockType(type)) {
    throw new Error(`Block type '${type}' cannot be created from the editor.`);
  }
  if (category === "content") {
    switch (type) {
      case "text": return { text: "" };
      case "heading": return { level: 1, text: "" };
      case "image": return { url: "", alt: "", caption: "" };
      case "video_embed": return { url: "" };
      case "key_insight": return { text: "" };
      case "key_point": return { title: "", text: "" };
      case "table": return { html: "" };
      case "file_download": return { url: "", filename: "", label: "", description: "", mimeType: "", size: 0 };
      default: return {};
    }
  } else {
    switch (type) {
      case "multiple_choice": return { question: "", options: ["", ""], correctIndex: 0 };
      case "true_false": return { question: "", correct: true };
      case "reflection": return { prompt: "" };
      case "drag_and_drop": return { question: "", items: ["", ""], correctOrder: [0, 1] };
      case "matching": return { question: "", pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
      case "dialog_cards": return { title: "", cards: [{ front: "", back: "" }] };
      default: return {};
    }
  }
}

/** The "+" that sits in the gap between two blocks and adds one right there. */
function InsertPoint({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (category: Category, type: string) => void;
}) {
  return (
    <Menu as="div" className="group/insert relative flex h-4 items-center justify-center">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 h-px bg-brand-300 opacity-0 transition-opacity group-focus-within/insert:opacity-100 group-hover/insert:opacity-100"
      />
      <Menu.Button
        disabled={disabled}
        aria-label="Add a block here"
        className="relative z-[1] flex h-5 w-5 items-center justify-center rounded-full border border-brand-300 bg-surface text-brand-600 opacity-0 shadow-sm transition-opacity hover:bg-brand-50 focus:opacity-100 group-hover/insert:opacity-100 data-[open]:opacity-100 [@media(hover:none)]:opacity-60"
      >
        <PlusIcon className="h-4 w-4" />
      </Menu.Button>
      <Menu.Items className="absolute left-1/2 top-full z-30 mt-1 w-56 -translate-x-1/2 rounded-md border border-gray-200 bg-surface py-1 shadow-lg focus:outline-none">
        <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Content
        </p>
        {CONTENT_TYPES.map(({ type, label }) => (
          <Menu.Item key={type}>
            {({ active }) => (
              <button
                type="button"
                onClick={() => onAdd("content", type)}
                className={`block w-full px-3 py-1.5 text-left text-sm text-gray-700 ${active ? "bg-gray-100" : ""}`}
              >
                {label}
              </button>
            )}
          </Menu.Item>
        ))}
        <p className="mt-1 border-t border-gray-100 px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
          Interactions
        </p>
        {INTERACTION_TYPES.map(({ type, label }) => (
          <Menu.Item key={type}>
            {({ active }) => (
              <button
                type="button"
                onClick={() => onAdd("interaction", type)}
                className={`block w-full px-3 py-1.5 text-left text-sm text-gray-700 ${active ? "bg-amber-50" : ""}`}
              >
                {label}
              </button>
            )}
          </Menu.Item>
        ))}
      </Menu.Items>
    </Menu>
  );
}

function sorted(blocks: BlockApiResponse[]) {
  return [...blocks].sort((a, b) => a.order - b.order);
}

export function BlockList({
  courseId,
  moduleId,
  lessonId,
  pageId,
  blocks,
  onRefresh,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  pageId: string;
  blocks: BlockApiResponse[];
  onRefresh: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [localBlocks, setLocalBlocks] = useState<BlockApiResponse[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  // Bumped when a block's data is replaced by the AI, so its editor remounts
  // with the new text instead of keeping (and later re-saving) the old text.
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [proposal, setProposal] = useState<{
    block: BlockApiResponse;
    data: Record<string, unknown>;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    setLocalBlocks(sorted(blocks));
  }, [blocks]);

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function flash(id: string) {
    setFlashId(id);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 700);
  }

  function fail(e: unknown, fallback: string) {
    toast({ message: e instanceof Error ? e.message : fallback, tone: "error" });
  }

  /** Shows the new order at once and saves it in the background. */
  async function applyOrder(reordered: BlockApiResponse[], movedId: string) {
    const previous = localBlocks;
    setLocalBlocks(reordered);
    flash(movedId);
    try {
      await reorderBlocks(
        courseId,
        moduleId,
        lessonId,
        pageId,
        reordered.map((b, i) => ({ id: b.id, order: i }))
      );
    } catch (e) {
      setLocalBlocks(previous);
      fail(e, "Couldn't save the new order");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = localBlocks.findIndex((b) => b.id === active.id);
    const newIndex = localBlocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    void applyOrder(arrayMove(localBlocks, oldIndex, newIndex), String(active.id));
  }

  function moveBlock(id: string, to: "up" | "down" | "top") {
    const index = localBlocks.findIndex((b) => b.id === id);
    if (index === -1) return;
    const target = to === "top" ? 0 : to === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= localBlocks.length || target === index) return;
    void applyOrder(arrayMove(localBlocks, index, target), id);
  }

  /** Creates a block and places it at `index` in the page. */
  async function insertBlock(
    category: Category,
    type: string,
    index: number,
    data = getDefaultData(category, type)
  ) {
    setAdding(true);
    try {
      const created = await createBlock(courseId, moduleId, lessonId, pageId, {
        category,
        type,
        data,
        order: localBlocks.length,
      });
      const next = [...localBlocks];
      next.splice(index, 0, created);
      setLocalBlocks(next);
      flash(created.id);
      if (index < localBlocks.length) {
        await reorderBlocks(
          courseId,
          moduleId,
          lessonId,
          pageId,
          next.map((b, i) => ({ id: b.id, order: i }))
        );
      }
      onRefresh();
    } catch (e) {
      fail(e, "Couldn't add the block");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(block: BlockApiResponse) {
    const snippet = blockSnippet(block.data);
    const ok = await confirm({
      title: `Delete this ${blockTypeLabel(block.type).toLowerCase()} block?`,
      message: (
        <>
          {snippet && (
            <span className="mb-2 block truncate rounded bg-gray-100 px-2 py-1 text-gray-700">
              {snippet}
            </span>
          )}
          This can&apos;t be undone.
        </>
      ),
      confirmLabel: "Delete block",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteBlock(courseId, moduleId, lessonId, pageId, block.id);
      setLocalBlocks((prev) => prev.filter((b) => b.id !== block.id));
      onRefresh();
    } catch (e) {
      fail(e, "Couldn't delete the block");
    }
  }

  /** Asks the AI for a new version. Nothing is saved until the author chooses. */
  async function handleRegenerate(block: BlockApiResponse) {
    setRegeneratingId(block.id);
    try {
      const result = await regenerateBlock(courseId, pageId, block.id, { preview: true });
      setProposal({ block, data: result.block.data });
    } catch (e) {
      fail(e, "Couldn't write a new version");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function acceptProposal(mode: "replace" | "insert") {
    if (!proposal) return;
    const { block, data } = proposal;
    setApplying(true);
    try {
      if (mode === "replace") {
        await updateBlock(courseId, moduleId, lessonId, pageId, block.id, { data });
        setLocalBlocks((prev) => prev.map((b) => (b.id === block.id ? { ...b, data } : b)));
        setVersions((prev) => ({ ...prev, [block.id]: (prev[block.id] ?? 0) + 1 }));
        flash(block.id);
        onRefresh();
      } else {
        const index = localBlocks.findIndex((b) => b.id === block.id);
        await insertBlock(block.category, block.type, index + 1, data);
      }
      setProposal(null);
    } catch (e) {
      fail(e, "Couldn't apply the new version");
    } finally {
      setApplying(false);
    }
  }

  const activeBlock = activeId ? localBlocks.find((b) => b.id === activeId) : null;
  const activeIndex = activeId ? localBlocks.findIndex((b) => b.id === activeId) : -1;
  const overIndex = overId ? localBlocks.findIndex((b) => b.id === overId) : -1;

  function describe(id: string | number) {
    const index = localBlocks.findIndex((b) => b.id === id);
    const block = localBlocks[index];
    return block ? `${blockTypeLabel(block.type)} block, position ${index + 1} of ${localBlocks.length}` : "block";
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOverId(null);
        }}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To reorder a block, press space or enter on its handle, use the up and down arrow keys to move it, then press space or enter again to drop it. Press escape to cancel. The block menu also has Move up and Move down.",
          },
          announcements: {
            onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
            onDragOver: ({ over }) => (over ? `Over ${describe(over.id)}.` : undefined),
            onDragEnd: ({ over }) => (over ? `Dropped at ${describe(over.id)}.` : "Dropped."),
            onDragCancel: () => "Reordering cancelled.",
          },
        }}
      >
        <SortableContext items={localBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div>
            {localBlocks.map((block, index) => (
              <div key={block.id}>
                {index > 0 && (
                  <InsertPoint
                    disabled={adding || activeId !== null}
                    onAdd={(category, type) => void insertBlock(category, type, index)}
                  />
                )}
                <SortableBlock
                  block={block}
                  editorKey={`${block.id}:${versions[block.id] ?? 0}`}
                  courseId={courseId}
                  moduleId={moduleId}
                  lessonId={lessonId}
                  pageId={pageId}
                  onRefresh={onRefresh}
                  onDelete={() => void handleDelete(block)}
                  onRegenerate={
                    REGENERABLE_BLOCK_TYPES.includes(block.type)
                      ? () => void handleRegenerate(block)
                      : undefined
                  }
                  regenerating={regeneratingId === block.id}
                  onMove={(to) => moveBlock(block.id, to)}
                  canMoveUp={index > 0}
                  canMoveDown={index < localBlocks.length - 1}
                  flash={flashId === block.id}
                  dropLine={
                    overIndex === index && activeIndex !== -1 && activeIndex !== index
                      ? activeIndex > index
                        ? "above"
                        : "below"
                      : null
                  }
                />
              </div>
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeBlock && (
            <div className="flex w-72 max-w-full cursor-grabbing items-center gap-2 rounded-lg border border-gray-300 bg-surface px-3 py-2 shadow-lg">
              <GripIcon className="h-3 w-3 shrink-0 text-gray-400" />
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {blockTypeLabel(activeBlock.type)}
              </span>
              <span className="truncate text-sm text-gray-700">
                {blockSnippet(activeBlock.data) || "Empty block"}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="space-y-3 pt-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Add Content</p>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => void insertBlock("content", type, localBlocks.length)}
                disabled={adding}
                className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Add Interaction</p>
          <div className="flex flex-wrap gap-2">
            {INTERACTION_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => void insertBlock("interaction", type, localBlocks.length)}
                disabled={adding}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Dialog
        open={proposal !== null}
        onClose={() => !applying && setProposal(null)}
        title={proposal ? `New version of this ${blockTypeLabel(proposal.block.type).toLowerCase()} block` : ""}
        size="xl"
        footer={
          <>
            <Button variant="ghost" disabled={applying} onClick={() => setProposal(null)}>
              Discard
            </Button>
            <Button variant="secondary" disabled={applying} onClick={() => void acceptProposal("insert")}>
              Insert below
            </Button>
            <Button loading={applying} onClick={() => void acceptProposal("replace")}>
              Replace
            </Button>
          </>
        }
      >
        {proposal && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Current</h3>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <BlockPreview data={proposal.block.data} />
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">New</h3>
              <div className="rounded-md border border-brand-200 bg-brand-50/40 p-3">
                <BlockPreview data={proposal.data} />
              </div>
            </div>
            <p className="text-xs text-gray-500 md:col-span-2">
              Nothing has changed yet. Replace swaps the current block for the new version. Insert
              below keeps both.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}
