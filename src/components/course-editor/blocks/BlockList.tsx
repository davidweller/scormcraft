"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BlockApiResponse } from "@/lib/api";
import {
  createBlock,
  deleteBlock,
  reorderBlocks,
  regenerateBlock,
} from "@/lib/api";
import { BlockEditor } from "./BlockEditor";
import type { ContentBlockType, InteractionBlockType } from "@/types/course";

interface SortableBlockProps {
  block: BlockApiResponse;
  courseId: string;
  moduleId: string;
  lessonId: string;
  pageId: string;
  onRefresh: () => void;
  onDelete: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

function SortableBlock({
  block,
  courseId,
  moduleId,
  lessonId,
  pageId,
  onRefresh,
  onDelete,
  onRegenerate,
  regenerating,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef}>
      <BlockEditor
        courseId={courseId}
        moduleId={moduleId}
        lessonId={lessonId}
        pageId={pageId}
        block={block}
        onRefresh={onRefresh}
        onDelete={onDelete}
        onRegenerate={onRegenerate}
        regenerating={regenerating}
        dragAttributes={attributes}
        dragListeners={listeners}
        isDragging={isDragging}
        style={style}
      />
    </div>
  );
}

const CONTENT_TYPES: { type: ContentBlockType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "heading", label: "Heading" },
  { type: "image", label: "Image" },
  { type: "video_embed", label: "Video" },
  { type: "key_insight", label: "Key insight" },
  { type: "key_point", label: "Key point" },
  { type: "table", label: "Table" },
  { type: "file_download", label: "File download" },
];

const INTERACTION_TYPES: { type: InteractionBlockType; label: string }[] = [
  { type: "multiple_choice", label: "Multiple choice" },
  { type: "true_false", label: "True / False" },
  { type: "drag_and_drop", label: "Drag & Drop" },
  { type: "matching", label: "Matching" },
  { type: "reflection", label: "Reflection" },
  { type: "dialog_cards", label: "Dialog Cards" },
];

function getDefaultData(category: "content" | "interaction", type: string): Record<string, unknown> {
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [showInteractionMenu, setShowInteractionMenu] = useState(false);
  
  const [localBlocks, setLocalBlocks] = useState<BlockApiResponse[]>([]);
  
  useEffect(() => {
    setLocalBlocks([...blocks].sort((a, b) => a.order - b.order));
  }, [blocks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localBlocks.findIndex((b) => b.id === active.id);
    const newIndex = localBlocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localBlocks, oldIndex, newIndex);
    setLocalBlocks(reordered);
    
    const orderUpdates = reordered.map((b, i) => ({ id: b.id, order: i }));

    try {
      await reorderBlocks(courseId, moduleId, lessonId, pageId, orderUpdates);
      onRefresh();
    } catch (e) {
      setLocalBlocks([...blocks].sort((a, b) => a.order - b.order));
      setError(e instanceof Error ? e.message : "Failed to reorder");
    }
  }

  async function handleRegenerate(blockId: string) {
    setRegeneratingId(blockId);
    try {
      await regenerateBlock(courseId, pageId, blockId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function addBlock(category: "content" | "interaction", type: string) {
    setError(null);
    setAdding(true);
    setShowInteractionMenu(false);
    try {
      const data = getDefaultData(category, type);
      await createBlock(courseId, moduleId, lessonId, pageId, {
        category,
        type,
        data,
        order: localBlocks.length,
      });
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add block");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={localBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {localBlocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                courseId={courseId}
                moduleId={moduleId}
                lessonId={lessonId}
                pageId={pageId}
                onRefresh={onRefresh}
                onDelete={async () => {
                  await deleteBlock(courseId, moduleId, lessonId, pageId, block.id);
                  onRefresh();
                }}
                onRegenerate={() => handleRegenerate(block.id)}
                regenerating={regeneratingId === block.id}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="space-y-3 pt-2">
        <div>
          <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Add Content</p>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock("content", type)}
                disabled={adding}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Add Interaction</p>
          <div className="flex flex-wrap gap-2">
            {INTERACTION_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock("interaction", type)}
                disabled={adding}
                className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
