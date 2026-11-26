"use client";

import { useState } from "react";
import type { PageApiResponse } from "@/lib/api";
import { updatePage } from "@/lib/api";
import { BlockList } from "./blocks/BlockList";

export function PageEditor({
  courseId,
  moduleId,
  lessonId,
  page,
  onRefresh,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
  page: PageApiResponse;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [saving, setSaving] = useState(false);

  async function saveTitle() {
    if (title.trim() === page.title) return;
    setSaving(true);
    try {
      await updatePage(courseId, moduleId, lessonId, page.id, { title: title.trim() });
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        className="mb-6 w-full border-0 border-b border-gray-200 bg-transparent text-2xl font-bold focus:border-brand-500 focus:outline-none focus:ring-0"
        placeholder="Page title"
      />
      {saving && <p className="text-xs text-gray-400">Saving…</p>}

      <section>
        <BlockList
          courseId={courseId}
          moduleId={moduleId}
          lessonId={lessonId}
          pageId={page.id}
          blocks={page.blocks}
          onRefresh={onRefresh}
        />
      </section>
    </div>
  );
}
