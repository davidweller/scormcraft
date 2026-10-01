"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Dialog, Transition, Tab } from "@headlessui/react";
import type { Media, MediaListResponse } from "@/types/media";
import { DOCUMENT_ACCEPT, DOCUMENT_EXTENSIONS_LABEL, formatFileSize, isDocumentMime } from "@/lib/document-files";

type GenerationStyle = "photorealistic" | "illustration" | "flat" | "3d";
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: Media) => void;
  geminiApiKey?: string;
  mode?: "image" | "video" | "file";
}

export default function MediaPickerModal({
  isOpen,
  onClose,
  onSelect,
  geminiApiKey,
  mode = "image",
}: MediaPickerModalProps) {
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<GenerationStyle>("illustration");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const isVideoMode = mode === "video";
  const isFileMode = mode === "file";
  const canGenerate = mode === "image";

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (search) params.set("search", search);

      const res = await fetch(`/api/media?${params}`);
      if (!res.ok) throw new Error("Failed to fetch media");

      const data = (await res.json()) as MediaListResponse;
      const filtered = data.media.filter((item) =>
        isFileMode
          ? isDocumentMime(item.mimeType)
          : isVideoMode
            ? item.mimeType === "video/mp4"
            : item.mimeType.startsWith("image/")
      );
      setMedia(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [search, isVideoMode, isFileMode]);

  useEffect(() => {
    if (isOpen) {
      fetchMedia();
    }
  }, [isOpen, fetchMedia]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/media", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Upload failed");
      }

      const { media: newMedia } = (await res.json()) as { media: Media };
      onSelect(newMedia);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style,
          aspectRatio,
          apiKey: geminiApiKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }

      const { media: newMedia } = (await res.json()) as { media: Media };
      onSelect(newMedia);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleSelectMedia(item: Media) {
    onSelect(item);
    onClose();
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
                  <span className="font-medium text-gray-900">{isFileMode ? "Select File" : isVideoMode ? "Select Video" : "Select Image"}</span>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                  >
                    &times;
                  </button>
                </Dialog.Title>

                <Tab.Group>
                  <Tab.List className="flex border-b border-gray-200">
                    {(canGenerate ? ["Library", "Upload", "Generate"] : ["Library", "Upload"]).map((tab) => (
                      <Tab
                        key={tab}
                        className={({ selected }) =>
                          `flex-1 py-2.5 text-sm font-medium focus:outline-none ${
                            selected
                              ? "text-indigo-600 border-b-2 border-indigo-600"
                              : "text-gray-500 hover:text-gray-700"
                          }`
                        }
                      >
                        {tab}
                      </Tab>
                    ))}
                  </Tab.List>

                  <Tab.Panels className="p-4">
                    <Tab.Panel>
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />

                      {loading ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                      ) : media.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          {isFileMode ? "No documents in library" : isVideoMode ? "No MP4 videos in library" : "No images in library"}
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto">
                          {media.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleSelectMedia(item)}
                              className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-indigo-500 transition-colors"
                            >
                              {item.mimeType.startsWith("image/") ? (
                                <img
                                  src={item.url}
                                  alt={item.alt || item.filename}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center bg-gray-50 p-2 text-center">
                                  <span className="text-2xl" aria-hidden="true">{isFileMode ? "📄" : "🎬"}</span>
                                  <span className="mt-1 line-clamp-2 text-[11px] text-gray-600">{item.filename}</span>
                                  <span className="mt-0.5 text-[10px] text-gray-400">
                                    {formatFileSize(item.size)}
                                  </span>
                                </div>
                              )}
                              {item.source === "ai_generated" && (
                                <span className="absolute top-1 right-1 px-1.5 py-0.5 bg-purple-600 text-white text-xs rounded">
                                  AI
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </Tab.Panel>

                    <Tab.Panel>
                      <div className="text-center py-8">
                        <label className="cursor-pointer inline-flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 transition-colors">
                          <input
                            type="file"
                            accept={isFileMode ? DOCUMENT_ACCEPT : isVideoMode ? "video/mp4" : "image/*"}
                            onChange={handleUpload}
                            disabled={uploading}
                            className="sr-only"
                          />
                          <svg
                            className="w-10 h-10 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="text-sm text-gray-600">
                            {uploading
                              ? "Uploading..."
                              : isFileMode
                                ? "Click to upload a document"
                                : isVideoMode
                                  ? "Click to upload an MP4 video"
                                  : "Click to upload an image"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {isFileMode
                              ? `${DOCUMENT_EXTENSIONS_LABEL}, max 4.5MB. Bundled into the SCORM package for learners to download.`
                              : isVideoMode
                                ? "MP4 only, max 100MB. Large files increase SCORM package size."
                                : "Images only, max 4.5MB."}
                          </span>
                        </label>
                        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                      </div>
                    </Tab.Panel>

                    {canGenerate && <Tab.Panel>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Describe the image
                          </label>
                          <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={3}
                            placeholder="A professional illustration of..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Style
                            </label>
                            <select
                              value={style}
                              onChange={(e) => setStyle(e.target.value as GenerationStyle)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="illustration">Illustration</option>
                              <option value="photorealistic">Photorealistic</option>
                              <option value="flat">Flat Design</option>
                              <option value="3d">3D Render</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Aspect Ratio
                            </label>
                            <select
                              value={aspectRatio}
                              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="1:1">Square (1:1)</option>
                              <option value="16:9">Landscape (16:9)</option>
                              <option value="9:16">Portrait (9:16)</option>
                              <option value="4:3">Standard (4:3)</option>
                            </select>
                          </div>
                        </div>
                        {error && <p className="text-sm text-red-600">{error}</p>}
                        <button
                          onClick={handleGenerate}
                          disabled={generating || !prompt.trim()}
                          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm font-medium text-white"
                        >
                          {generating ? "Generating..." : "Generate Image"}
                        </button>
                      </div>
                    </Tab.Panel>}
                  </Tab.Panels>
                </Tab.Group>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
