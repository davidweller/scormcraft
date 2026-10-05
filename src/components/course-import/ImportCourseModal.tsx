"use client";

import { useState, Fragment, useCallback, useEffect, useRef } from "react";
import { Dialog, Transition } from "@headlessui/react";
import type { ImportedCourseData } from "@/lib/ai-course-import";
import { countImportedContent } from "@/lib/ai-course-import";

interface ImportCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (courseId: string) => void;
  openaiKey?: string;
}

type ImportStep = "upload" | "analyzing" | "preview" | "creating";

export default function ImportCourseModal({
  isOpen,
  onClose,
  onImportComplete,
  openaiKey,
}: ImportCourseModalProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportedCourseData | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const resetState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("upload");
    setError(null);
    setFile(null);
    setPreview(null);
    setDragActive(false);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (step !== "analyzing") return;
    setElapsedSeconds(0);
    const id = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [step]);

  function handleClose() {
    resetState();
    onClose();
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  }

  function isSupportedImportFile(name: string): boolean {
    const lower = name.toLowerCase();
    return lower.endsWith(".docx") || lower.endsWith(".md") || lower.endsWith(".markdown");
  }

  async function handleFileSelect(selectedFile: File) {
    if (!isSupportedImportFile(selectedFile.name)) {
      setError("Please upload a .docx or .md file");
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (selectedFile.size > maxSize) {
      setError(`File too large. Maximum size is 10MB, your file is ${(selectedFile.size / 1024 / 1024).toFixed(1)}MB.`);
      return;
    }

    setFile(selectedFile);
    setError(null);
    setStep("analyzing");

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("action", "preview");
      if (openaiKey) {
        formData.append("apiKey", openaiKey);
      }

      const res = await fetch("/api/courses/import", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to analyze document");
      }

      const { preview: previewData } = (await res.json()) as { preview: ImportedCourseData };
      setPreview(previewData);
      setStep("preview");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to analyze document");
      setStep("upload");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }

  async function handleConfirmImport() {
    if (!preview) return;

    setStep("creating");
    setError(null);

    try {
      const res = await fetch("/api/courses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importData: preview }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to import course");
      }

      const { course } = (await res.json()) as { course: { id: string } };
      if (!course?.id) {
        throw new Error("Course was not created properly");
      }
      onImportComplete(course.id);
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import course");
      setStep("preview");
    }
  }

  const counts = preview ? countImportedContent(preview) : null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
                <Dialog.Title className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {step === "upload" && "Import Course"}
                    {step === "analyzing" && "Analyzing Document..."}
                    {step === "preview" && "Review Imported Course"}
                    {step === "creating" && "Creating Course..."}
                  </span>
                  <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  >
                    &times;
                  </button>
                </Dialog.Title>

                <div className="p-4">
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  {step === "upload" && (
                    <div className="space-y-4">
                      <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                          dragActive
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        <input
                          type="file"
                          accept=".docx,.md,.markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
                          onChange={handleFileInput}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <p className="mt-2 text-sm text-gray-600">
                          <span className="font-medium text-blue-600">Click to upload</span> or drag
                          and drop
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Word (.docx) or Markdown (.md) from Obsidian, up to 10MB
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>
                          AI will analyze your document and extract the course structure,
                          content, and interactions.
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <a
                          href="/templates/course-template.docx"
                          download
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Word template
                        </a>
                        <a
                          href="/templates/course-template.md"
                          download
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Markdown template
                        </a>
                      </div>
                    </div>
                  )}

                  {step === "analyzing" && (
                    <div className="py-12 text-center">
                      <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-blue-600" />
                      <p className="mt-4 text-sm text-gray-600">
                        Analyzing document by module...
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Large documents are processed section by section and can take several minutes
                      </p>
                      <p className="mt-3 text-xs tabular-nums text-gray-400">
                        Elapsed: {elapsedSeconds}s
                      </p>
                    </div>
                  )}

                  {step === "preview" && preview && counts && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{preview.title}</h3>
                        {preview.overview && (
                          <p className="mt-1 text-sm text-gray-600">{preview.overview}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <StatCard label="Modules" value={counts.modules} />
                        <StatCard label="Lessons" value={counts.lessons} />
                        <StatCard label="Pages" value={counts.pages} />
                        <StatCard label="Content" value={counts.contentBlocks} />
                        <StatCard label="Interactions" value={counts.interactions} />
                      </div>

                      {preview.ilos.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700">Learning Outcomes</h4>
                          <ul className="mt-1 text-sm text-gray-600 list-disc list-inside space-y-0.5">
                            {preview.ilos.slice(0, 4).map((ilo, i) => (
                              <li key={i}>{ilo}</li>
                            ))}
                            {preview.ilos.length > 4 && (
                              <li className="text-gray-400">
                                +{preview.ilos.length - 4} more...
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      <div>
                        <h4 className="text-sm font-medium text-gray-700">Course Structure</h4>
                        <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md">
                          {preview.modules.map((module, mi) => (
                            <div key={mi} className="border-b border-gray-100 last:border-b-0">
                              <div className="px-3 py-2 bg-gray-50 font-medium text-sm text-gray-700">
                                {module.title}
                              </div>
                              <ul className="px-3 py-1">
                                {module.lessons.map((lesson, li) => (
                                  <li
                                    key={li}
                                    className="py-1 text-sm text-gray-600 flex items-center gap-2"
                                  >
                                    <span className="text-gray-400">-</span>
                                    {lesson.title}
                                    <span className="text-xs text-gray-400">
                                      ({lesson.pages.length} page
                                      {lesson.pages.length !== 1 ? "s" : ""})
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                        <button
                          onClick={() => {
                            setStep("upload");
                            setFile(null);
                            setPreview(null);
                          }}
                          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Upload Different File
                        </button>
                        <button
                          onClick={handleConfirmImport}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                        >
                          Create Course
                        </button>
                      </div>
                    </div>
                  )}

                  {step === "creating" && (
                    <div className="py-12 text-center">
                      <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-blue-600" />
                      <p className="mt-4 text-sm text-gray-600">Creating your course...</p>
                    </div>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2 bg-gray-50 rounded-md text-center">
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
