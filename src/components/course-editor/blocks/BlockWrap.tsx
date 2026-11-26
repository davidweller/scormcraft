"use client";

import { useState, useRef, useEffect } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
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
}: BlockWrapProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  const typeLabel = formatBlockType(blockType);
  const bgClass =
    variant === "interaction"
      ? "border-amber-100 bg-amber-50/50"
      : "border-gray-200 bg-surface";

  return (
    <div
      className={`group relative rounded border p-3 transition-shadow ${bgClass} ${isDragging ? "shadow-lg ring-2 ring-brand-400" : ""} ${regenerating ? "opacity-60" : ""}`}
      style={style}
    >
      {/* Left side: drag handle */}
      <div className="absolute -left-1 top-1/2 -translate-x-full -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        {dragAttributes && dragListeners && (
          <DragHandle attributes={dragAttributes} listeners={dragListeners} />
        )}
      </div>

      {/* Top right: type label + actions */}
      <div className="absolute right-2 top-2 flex items-center gap-2">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
          {typeLabel}
        </span>
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {regenerating && <span className="text-xs text-brand-500">Regenerating…</span>}

        {/* Actions menu */}
        <div className="relative opacity-0 transition-opacity group-hover:opacity-100" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Block actions"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 min-w-[140px] rounded-md border border-gray-200 bg-surface py-1 shadow-lg">
              {onRegenerate && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRegenerate();
                  }}
                  disabled={regenerating}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshIcon />
                  Regenerate
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <TrashIcon />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Block content */}
      <div className="pr-20">{children}</div>
    </div>
  );
}

function formatBlockType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
