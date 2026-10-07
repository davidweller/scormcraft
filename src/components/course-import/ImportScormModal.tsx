"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { upload } from "@vercel/blob/client";
import { groupLoss, type LossGroup } from "@/lib/scorm/import/preview";
import type { ScormImportPreview } from "@/lib/scorm/import/types";

interface ImportScormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (courseId: string) => void;
}

type Step = "upload" | "uploading" | "analyzing" | "review" | "creating";

/** Mirrors DEFAULT_ZIP_LIMITS.maxArchiveBytes on the server. */
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
/** The multipart fallback's cap, used when Blob storage is not configured. */
const MULTIPART_MAX_BYTES = 4 * 1024 * 1024;

function newImportToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function ImportScormModal({
  isOpen,
  onClose,
  onImportComplete,
}: ImportScormModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadBytes, setUploadBytes] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [preview, setPreview] = useState<ScormImportPreview | null>(null);
  const [title, setTitle] = useState("");
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [expandedLoss, setExpandedLoss] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const resetState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("upload");
    setError(null);
    setDragActive(false);
    setUploadBytes(0);
    setElapsedSeconds(0);
    setPreview(null);
    setTitle("");
    setExpandedModules(new Set());
    setExpandedLoss(new Set());
  }, []);

  useEffect(() => {
    if (step !== "analyzing") return;
    setElapsedSeconds(0);
    const id = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  function handleClose() {
    resetState();
    onClose();
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) void handleFileSelect(dropped);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) void handleFileSelect(selected);
  }

  /**
   * Upload straight to Blob, then ask the server to analyse it by token.
   *
   * Falls back to a multipart POST when Blob is not configured, which is the
   * local-development path and is capped well below Vercel's body limit.
   */
  async function handleFileSelect(file: File) {
    if (!/\.zip$/i.test(file.name)) {
      setError("Please upload a .zip SCORM package.");
      return;
    }
    if (file.size > MAX_PACKAGE_BYTES) {
      setError(
        `Package is ${formatBytes(file.size)}; the maximum is ${formatBytes(MAX_PACKAGE_BYTES)}.`
      );
      return;
    }

    setError(null);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const importToken = newImportToken();
      let analyzeInit: RequestInit;

      try {
        setStep("uploading");
        setUploadBytes(file.size);
        await upload(`imports/scorm/${importToken}/package.zip`, file, {
          access: "public",
          handleUploadUrl: "/api/courses/import-scorm/upload-url",
          contentType: file.type || "application/zip",
          // No onUploadProgress: it arrived in @vercel/blob 0.26 and this
          // project is pinned to 0.24 for the existing put/del/list callers.
          // The upload step shows an indeterminate spinner instead.
        });
        analyzeInit = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ importToken, filename: file.name }),
          signal: controller.signal,
        };
      } catch (uploadError) {
        // Blob is not configured (503 from upload-url) or the handshake failed.
        if (file.size > MULTIPART_MAX_BYTES) {
          throw new Error(
            `Direct upload is unavailable, and this package is ${formatBytes(
              file.size
            )}. Packages over ${formatBytes(
              MULTIPART_MAX_BYTES
            )} need Blob storage configured. (${
              uploadError instanceof Error ? uploadError.message : "upload failed"
            })`
          );
        }
        const form = new FormData();
        form.append("file", file);
        analyzeInit = { method: "POST", body: form, signal: controller.signal };
      }

      setStep("analyzing");
      const res = await fetch("/api/courses/import-scorm/analyze", analyzeInit);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not analyse the package.");
      }

      const { preview: result } = (await res.json()) as { preview: ScormImportPreview };
      setPreview(result);
      setTitle(result.course.title);
      setExpandedModules(new Set(result.tree.map((_, i) => i)));
      setStep("review");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not import the package.");
      setStep("upload");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function handleCommit() {
    if (!preview) return;
    setStep("creating");
    setError(null);
    try {
      const res = await fetch("/api/courses/import-scorm/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importToken: preview.importToken, title }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not create the course.");
      }
      const { course } = (await res.json()) as { course: { id: string } };
      resetState();
      onImportComplete(course.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the course.");
      setStep("review");
    }
  }

  function toggleModule(index: number) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleLoss(code: string) {
    setExpandedLoss((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const lossGroups: LossGroup[] = preview ? groupLoss(preview.loss) : [];

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
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
                <Dialog.Title className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <span className="font-medium text-gray-900">
                    {step === "upload" && "Import SCORM package"}
                    {step === "uploading" && "Uploading package…"}
                    {step === "analyzing" && "Reading package…"}
                    {step === "review" && "Review imported course"}
                    {step === "creating" && "Creating course…"}
                  </span>
                  <button
                    onClick={handleClose}
                    className="text-xl leading-none text-gray-400 hover:text-gray-600"
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </Dialog.Title>

                <div className="max-h-[75vh] overflow-y-auto p-4">
                  {error && (
                    <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
                        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                          dragActive
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        <input
                          type="file"
                          accept=".zip,application/zip,application/x-zip-compressed"
                          onChange={handleFileInput}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                          />
                        </svg>
                        <p className="mt-2 text-sm text-gray-600">
                          <span className="font-medium text-blue-600">Click to upload</span> or drag
                          and drop a .zip package
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Up to {formatBytes(MAX_PACKAGE_BYTES)}
                        </p>
                      </div>

                      <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                        <p className="font-medium text-gray-700">What imports well</p>
                        <p className="mt-1">
                          Packages exported from this app come back exactly as they left, including
                          answer keys. Other SCORM packages built from plain HTML import as editable
                          content, with a report of anything that could not be converted. Articulate
                          Storyline, Rise and Adobe Captivate packages are not supported: their
                          content is compiled into JavaScript rather than stored as pages.
                        </p>
                      </div>
                    </div>
                  )}

                  {(step === "uploading" || step === "analyzing" || step === "creating") && (
                    <div className="py-10 text-center">
                      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
                      <p className="mt-4 text-sm text-gray-600">
                        {step === "uploading" && `Uploading ${formatBytes(uploadBytes)}…`}
                        {step === "analyzing" &&
                          `Reading the package… ${elapsedSeconds}s elapsed`}
                        {step === "creating" && "Creating the course…"}
                      </p>
                      {step === "analyzing" && elapsedSeconds > 30 && (
                        <p className="mt-2 text-xs text-gray-500">
                          Large packages take a few minutes. Leave this open.
                        </p>
                      )}
                    </div>
                  )}

                  {step === "review" && preview && (
                    <div className="space-y-4">
                      <div
                        className={`rounded-md border p-3 text-sm ${
                          preview.fidelity === "lossless"
                            ? "border-green-200 bg-green-50 text-green-800"
                            : preview.fidelity === "high"
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : "border-amber-200 bg-amber-50 text-amber-800"
                        }`}
                      >
                        <p className="font-medium">
                          {preview.roundTrip
                            ? "Lossless round trip — this package was exported by this app"
                            : "Reconstructed from the package's HTML"}
                        </p>
                        <p className="mt-1">
                          {preview.counts.modules} module(s), {preview.counts.lessons} lesson(s),{" "}
                          {preview.counts.pages} page(s), {preview.counts.blocks} block(s),{" "}
                          {preview.counts.interactions} interaction(s).
                          {preview.counts.embeddedPages > 0 &&
                            ` ${preview.counts.embeddedPages} page(s) preserved read-only.`}
                          {preview.counts.needsReview > 0 &&
                            ` ${preview.counts.needsReview} item(s) need review.`}
                        </p>
                      </div>

                      {preview.warnings.length > 0 && (
                        <ul className="list-inside list-disc rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          {preview.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}

                      <div>
                        <label
                          htmlFor="scorm-import-title"
                          className="block text-xs font-medium text-gray-500"
                        >
                          Course title
                        </label>
                        <input
                          id="scorm-import-title"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-medium text-gray-500">Structure</p>
                        <div className="divide-y divide-gray-100 rounded border border-gray-200">
                          {preview.tree.map((mod, mi) => (
                            <div key={mi}>
                              <button
                                type="button"
                                onClick={() => toggleModule(mi)}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                              >
                                <span className="font-medium text-gray-800">{mod.title}</span>
                                <span className="text-xs text-gray-500">
                                  {expandedModules.has(mi) ? "−" : "+"}
                                </span>
                              </button>
                              {expandedModules.has(mi) && (
                                <div className="bg-gray-50 px-3 pb-2">
                                  {mod.lessons.map((lesson, li) => (
                                    <div key={li} className="pt-2">
                                      <p className="text-xs font-medium text-gray-600">
                                        {lesson.title}
                                      </p>
                                      <ul className="mt-1 space-y-0.5">
                                        {lesson.pages.map((page, pi) => (
                                          <li
                                            key={pi}
                                            className="flex items-center gap-2 text-xs text-gray-600"
                                          >
                                            <span className="truncate">{page.title}</span>
                                            <span className="text-gray-400">
                                              {page.blockCount} block(s)
                                            </span>
                                            {page.embedded && (
                                              <span className="rounded bg-gray-200 px-1 text-[10px] uppercase text-gray-700">
                                                preserved
                                              </span>
                                            )}
                                            {page.needsReview && (
                                              <span className="rounded bg-amber-200 px-1 text-[10px] uppercase text-amber-900">
                                                review
                                              </span>
                                            )}
                                            {page.blockCount === 0 && (
                                              <span className="rounded bg-red-100 px-1 text-[10px] uppercase text-red-700">
                                                empty
                                              </span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/*
                        Always visible, never behind a disclosure triangle: what
                        the import could not carry across is the thing a user
                        most needs to see before committing.
                      */}
                      <div>
                        <p className="mb-2 text-xs font-medium text-gray-500">What was lost</p>
                        {lossGroups.length === 0 ? (
                          <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                            Nothing. Every page, block and asset came across intact.
                          </p>
                        ) : (
                          <div className="divide-y divide-gray-100 rounded border border-gray-200">
                            {lossGroups.map((group) => (
                              <div key={group.code} className="px-3 py-2">
                                <div className="flex items-start gap-2">
                                  <span className="mt-0.5 rounded bg-gray-100 px-1.5 text-xs font-medium text-gray-700">
                                    {group.count}
                                  </span>
                                  <p className="flex-1 text-xs text-gray-600">
                                    {group.description}
                                  </p>
                                  {group.locations.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => toggleLoss(group.code)}
                                      className="text-xs text-blue-600 hover:underline"
                                    >
                                      {expandedLoss.has(group.code) ? "hide" : "where"}
                                    </button>
                                  )}
                                </div>
                                {expandedLoss.has(group.code) && (
                                  <ul className="mt-1 list-inside list-disc pl-8 text-[11px] text-gray-500">
                                    {group.locations.slice(0, 50).map((loc, i) => (
                                      <li key={i} className="truncate">
                                        {loc}
                                      </li>
                                    ))}
                                    {group.locations.length > 50 && (
                                      <li>…and {group.locations.length - 50} more</li>
                                    )}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {step === "review" && (
                  <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCommit}
                      disabled={!title.trim()}
                      className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Create course
                    </button>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
