"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpTrayIcon,
  DocumentIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import ImportCourseModal from "@/components/course-import/ImportCourseModal";
import ImportScormModal from "@/components/course-import/ImportScormModal";
import { Button, ErrorNote, Field, Input, Select, Textarea } from "@/components/ui";

type Path = "ai" | "import" | "blank";

const PATHS: { id: Path; title: string; description: string; icon: typeof SparklesIcon }[] = [
  {
    id: "ai",
    title: "Create with AI",
    description: "Describe the course. You approve the outline before any lesson is written.",
    icon: SparklesIcon,
  },
  {
    id: "import",
    title: "Import a course",
    description: "Bring in a Word or Markdown document, or a package exported from SCORMcraft.",
    icon: ArrowUpTrayIcon,
  },
  {
    id: "blank",
    title: "Start blank",
    description: "An empty course. Add modules, lessons and pages yourself in the editor.",
    icon: DocumentIcon,
  },
];

export default function NewCoursePage() {
  const router = useRouter();
  const [path, setPath] = useState<Path>("ai");
  const [title, setTitle] = useState("");
  const [overview, setOverview] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [targetWordCount, setTargetWordCount] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showScormImportModal, setShowScormImportModal] = useState(false);

  /** Creates the course, then opens the wizard (AI) or the editor (blank). */
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the course a title.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ...(path === "ai" && {
            overview: overview.trim() || undefined,
            audience: audience.trim() || undefined,
            tone: tone || undefined,
            targetWordCount: targetWordCount !== "" ? targetWordCount : undefined,
          }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create course");
      }
      const course = await res.json();
      router.push(path === "ai" ? `/courses/${course.id}/build` : `/courses/${course.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-3rem)] p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">New course</h1>
        <p className="mt-1 text-sm text-gray-500">Choose how to start. You can change anything later.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="How to start">
          {PATHS.map((p) => {
            const active = path === p.id;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setPath(p.id);
                  setError(null);
                }}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  active
                    ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                    : "border-gray-200 bg-surface hover:border-gray-300"
                }`}
              >
                <Icon className={`h-6 w-6 ${active ? "text-brand-600" : "text-gray-400"}`} />
                <span className="mt-2 block font-medium text-gray-900">{p.title}</span>
                <span className="mt-1 block text-sm text-gray-500">{p.description}</span>
              </button>
            );
          })}
        </div>

        {error && <ErrorNote className="mt-6">{error}</ErrorNote>}

        {path === "import" ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-lg border border-gray-200 bg-surface p-5">
              <h2 className="font-medium text-gray-900">A Word or Markdown document</h2>
              <p className="mt-1 text-sm text-gray-500">
                Headings become modules, lessons and pages, and your text is kept as written. You
                review the result before the course is created.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button onClick={() => setShowImportModal(true)}>Choose a document</Button>
                <a
                  href="/templates/course-template.docx"
                  download
                  className="text-sm text-brand-600 hover:underline"
                >
                  Word template
                </a>
                <a
                  href="/templates/course-template.md"
                  download
                  className="text-sm text-brand-600 hover:underline"
                >
                  Markdown template
                </a>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-surface p-5">
              <h2 className="font-medium text-gray-900">A SCORMcraft package</h2>
              <p className="mt-1 text-sm text-gray-500">
                A .zip exported from SCORMcraft comes back exactly as it left. Packages made in
                other tools can&apos;t be imported yet.
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => setShowScormImportModal(true)}>
                Choose a package
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={create} className="mt-8 space-y-5">
            <Field label={path === "ai" ? "Course title or topic" : "Course title"}>
              {(id) => (
                <Input
                  id={id}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Fire safety for office staff"
                  autoFocus
                />
              )}
            </Field>

            {path === "ai" && (
              <>
                <Field
                  label="What should it cover?"
                  hint="A few sentences is enough. The more specific, the better the outline."
                >
                  {(id) => (
                    <Textarea
                      id={id}
                      rows={4}
                      value={overview}
                      onChange={(e) => setOverview(e.target.value)}
                      placeholder="e.g. What to do when the alarm sounds, how to use an extinguisher, and who the fire wardens are."
                    />
                  )}
                </Field>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Audience">
                    {(id) => (
                      <Input
                        id={id}
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                        placeholder="e.g. New starters"
                      />
                    )}
                  </Field>
                  <Field label="Tone">
                    {(id) => (
                      <Select id={id} value={tone} onChange={(e) => setTone(e.target.value)}>
                        <option value="">No preference</option>
                        <option value="conversational">Conversational</option>
                        <option value="professional">Professional</option>
                        <option value="formal">Formal</option>
                        <option value="friendly">Friendly</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Length" hint="Total words across all lessons.">
                    {(id) => (
                      <Select
                        id={id}
                        value={targetWordCount}
                        onChange={(e) => setTargetWordCount(e.target.value ? Number(e.target.value) : "")}
                      >
                        <option value="">No target</option>
                        <option value={1500}>Short (about 1,500)</option>
                        <option value={4000}>Medium (about 4,000)</option>
                        <option value={8000}>Long (about 8,000)</option>
                      </Select>
                    )}
                  </Field>
                </div>
              </>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" loading={loading}>
                {path === "ai" ? "Continue to the outline" : "Create and open the editor"}
              </Button>
              <Button variant="ghost" onClick={() => router.push("/courses")}>
                Cancel
              </Button>
            </div>
            {path === "ai" && (
              <p className="text-xs text-gray-500">
                Next, the AI drafts an outline for you to edit and approve. Nothing is written into
                lessons until you say so.
              </p>
            )}
          </form>
        )}
      </div>

      <ImportCourseModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        // Straight to the editor: an imported document already has its structure
        // and content, so the outline and generation steps have nothing to add.
        onImportComplete={(courseId) => router.push(`/courses/${courseId}/edit`)}
      />
      <ImportScormModal
        isOpen={showScormImportModal}
        onClose={() => setShowScormImportModal(false)}
        onImportComplete={(courseId) => router.push(`/courses/${courseId}/edit`)}
      />
    </main>
  );
}
