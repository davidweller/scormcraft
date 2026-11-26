"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClockIcon } from "@heroicons/react/24/outline";
import { Button, Card, EmptyState, ErrorNote, Skeleton, useConfirm, useToast } from "@/components/ui";

interface SnapshotItem {
  id: string;
  reason: string;
  createdAt: string;
  counts: { modules: number; lessons: number; pages: number; blocks: number };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function HistoryPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<SnapshotItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/courses/${courseId}/snapshots`, { cache: "no-store" });
      if (!res.ok) throw new Error("Couldn't load the history.");
      setItems(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the history.");
      setItems([]);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveNow() {
    setSaving(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save a version.");
      toast("Version saved");
      await load();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Couldn't save a version.", tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function restore(item: SnapshotItem) {
    const when = new Date(item.createdAt).toLocaleString();
    const ok = await confirm({
      title: "Restore this version?",
      message: `The course's modules, lessons, pages and content go back to how they were on ${when}. The course as it is now is saved to this list first, so you can undo the restore.`,
      confirmLabel: "Restore",
    });
    if (!ok) return;
    setRestoringId(item.id);
    try {
      const res = await fetch(`/api/courses/${courseId}/snapshots/${item.id}/restore`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't restore this version.");
      toast("Version restored");
      await load();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Couldn't restore this version.", tone: "error" });
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">History</h1>
            <p className="mt-1 max-w-lg text-sm text-gray-500">
              A version is saved automatically before anything that replaces or deletes content:
              regenerating a lesson, deleting a module, lesson or page, or a blueprint save that
              removes lessons. The newest 25 are kept.
            </p>
          </div>
          <Button variant="secondary" onClick={saveNow} loading={saving}>
            Save a version now
          </Button>
        </div>

        {error && <ErrorNote className="mt-6">{error}</ErrorNote>}

        <div className="mt-6 space-y-2">
          {items === null ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : items.length === 0 && !error ? (
            <EmptyState
              icon={<ClockIcon />}
              title="No saved versions yet"
              description="One appears here the first time you regenerate or delete something. You can also save one yourself before a big change."
            />
          ) : (
            items.map((item) => (
              <Card key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{item.reason}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {new Date(item.createdAt).toLocaleString()} ·{" "}
                    {plural(item.counts.modules, "module")}, {plural(item.counts.lessons, "lesson")},{" "}
                    {plural(item.counts.pages, "page")}, {plural(item.counts.blocks, "block")}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => restore(item)}
                  loading={restoringId === item.id}
                  disabled={restoringId !== null}
                >
                  Restore
                </Button>
              </Card>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
