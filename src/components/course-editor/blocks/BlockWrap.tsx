"use client";

import { Menu } from "@headlessui/react";
import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  ArrowUpOnSquareIcon,
  EllipsisVerticalIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { BLOCK_TYPE_LABELS } from "@/types/course";
import type { BlockType } from "@/types/course";
import { DragHandle } from "./DragHandle";

interface BlockWrapProps {
  blockId: string;
  blockType: string;
  variant?: "content" | "interaction";
  saving?: boolean;
  regenerating?: boolean;
  children: React.ReactNode;
  onDelete: () => void;
  onRegenerate?: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  isDragging?: boolean;
  style?: React.CSSProperties;
  onMove?: (to: "up" | "down" | "top") => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  flash?: boolean;
}

export function blockTypeLabel(type: string): string {
  return (
    BLOCK_TYPE_LABELS[type as BlockType] ??
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// Hidden until the block is hovered or holds keyboard focus. Always shown on
// touch screens, which have no hover.
const REVEAL =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
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
          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-40 ${
            danger ? "text-red-600" : "text-gray-700"
          } ${active ? (danger ? "bg-red-50" : "bg-gray-100") : ""}`}
        >
          <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
          {label}
        </button>
      )}
    </Menu.Item>
  );
}

export function BlockWrap({
  blockType,
  variant = "content",
  saving,
  regenerating,
  children,
  onDelete,
  onRegenerate,
  dragAttributes,
  dragListeners,
  isDragging,
  style,
  onMove,
  canMoveUp,
  canMoveDown,
  flash,
}: BlockWrapProps) {
  const typeLabel = blockTypeLabel(blockType);
  const bgClass =
    variant === "interaction" ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-surface";

  return (
    <div
      className={`group relative rounded-lg border p-3 transition-[box-shadow,opacity] duration-300 ${bgClass} ${
        isDragging ? "opacity-40" : ""
      } ${flash ? "ring-2 ring-brand-400" : ""} ${regenerating ? "opacity-60" : ""}`}
      style={style}
    >
      {dragAttributes && dragListeners && (
        <div className={`absolute -left-1 top-2 -translate-x-full ${REVEAL}`}>
          <DragHandle
            attributes={dragAttributes}
            listeners={dragListeners}
            label={`Reorder ${typeLabel} block`}
          />
        </div>
      )}

      <div className="absolute right-2 top-2 flex items-center gap-2">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
          {typeLabel}
        </span>
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {regenerating && <span className="text-xs text-brand-600">Writing…</span>}

        <Menu as="div" className={`relative ${REVEAL} data-[open]:opacity-100`}>
          <Menu.Button
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={`${typeLabel} block actions`}
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </Menu.Button>
          <Menu.Items className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-surface py-1 shadow-lg focus:outline-none">
            {onMove && (
              <>
                <MenuItem
                  icon={<ArrowUpIcon />}
                  label="Move up"
                  disabled={!canMoveUp}
                  onClick={() => onMove("up")}
                />
                <MenuItem
                  icon={<ArrowDownIcon />}
                  label="Move down"
                  disabled={!canMoveDown}
                  onClick={() => onMove("down")}
                />
                <MenuItem
                  icon={<ArrowUpOnSquareIcon />}
                  label="Move to top"
                  disabled={!canMoveUp}
                  onClick={() => onMove("top")}
                />
                <div className="my-1 border-t border-gray-100" />
              </>
            )}
            {onRegenerate && (
              <MenuItem
                icon={<ArrowPathIcon />}
                label="Rewrite with AI…"
                disabled={regenerating}
                onClick={onRegenerate}
              />
            )}
            <MenuItem icon={<TrashIcon />} label="Delete" danger onClick={onDelete} />
          </Menu.Items>
        </Menu>
      </div>

      <div className="pr-20">{children}</div>
    </div>
  );
}
