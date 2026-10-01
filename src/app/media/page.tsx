"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Media, MediaListResponse } from "@/types/media";

type GenerationStyle = "photorealistic" | "illustration" | "flat" | "3d";
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export default function MediaLibraryPage() {
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"" | "upload" | "ai_generated">("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<GenerationStyle>("illustration");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");

  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: "20" });
      if (search) params.set("search", search);
      if (sourceFilter) params.set("source", sourceFilter);

      const res = await fetch(`/api/media?${params}`);
      if (!res.ok) throw new Error("Failed to fetch media");

      const data = (await res.json()) as MediaListResponse;
      setMedia(data.media);
      setTotalPages(data.pagination.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [page, search, sourceFilter]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

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

      await fetchMedia();
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
        body: JSON.stringify({ prompt: prompt.trim(), style, aspectRatio }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }

      setShowGenerateModal(false);
      setPrompt("");
      await fetchMedia();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this image? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/media?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");

      setSelectedMedia(null);
      await fetchMedia();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                &larr; Back
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">Media Library</h1>
            </div>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="sr-only"
                />
                {uploading ? "Uploading..." : "Upload Image"}
              </label>
              <button
                onClick={() => setShowGenerateModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Generate with AI
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="mb-6 flex items-center gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by filename or prompt..."
            className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value as typeof sourceFilter);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All sources</option>
            <option value="upload">Uploaded</option>
            <option value="ai_generated">AI Generated</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : media.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No media found</p>
            <p className="text-gray-400 text-sm">
              Upload an image or generate one with AI to get started.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {media.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedMedia(item)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selectedMedia?.id === item.id
                      ? "border-indigo-500 ring-2 ring-indigo-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {item.mimeType.startsWith("image/") ? (
                    <img
                      src={item.url}
                      alt={item.alt || item.filename}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gray-50 p-2 text-center">
                      <span className="text-3xl" aria-hidden="true">{item.mimeType.startsWith("video/") ? "🎬" : "📄"}</span>
                      <span className="mt-1 line-clamp-2 text-xs text-gray-600">{item.filename}</span>
                    </div>
                  )}
                  {item.source === "ai_generated" && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">
                      AI
                    </span>
                  )}
                </button>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {selectedMedia && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Media Details</h2>
              <button
                onClick={() => setSelectedMedia(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              {selectedMedia.mimeType.startsWith("image/") ? (
                <img
                  src={selectedMedia.url}
                  alt={selectedMedia.alt || selectedMedia.filename}
                  className="w-full max-h-80 object-contain rounded-lg bg-gray-100"
                />
              ) : (
                <a
                  href={selectedMedia.url}
                  className="flex items-center justify-center gap-2 rounded-lg bg-gray-100 py-10 text-sm text-indigo-600 hover:underline"
                >
                  <span aria-hidden="true">{selectedMedia.mimeType.startsWith("video/") ? "🎬" : "📄"}</span>
                  Open {selectedMedia.filename}
                </a>
              )}
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Filename</dt>
                  <dd className="text-gray-900">{selectedMedia.filename}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Source</dt>
                  <dd className="text-gray-900">
                    {selectedMedia.source === "ai_generated" ? "AI Generated" : "Uploaded"}
                  </dd>
                </div>
                {selectedMedia.prompt && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Prompt</dt>
                    <dd className="text-gray-900 text-right max-w-xs truncate" title={selectedMedia.prompt}>
                      {selectedMedia.prompt}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-500">Size</dt>
                  <dd className="text-gray-900">{(selectedMedia.size / 1024).toFixed(1)} KB</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => copyUrl(selectedMedia.url)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm font-medium text-gray-700"
                >
                  Copy URL
                </button>
                <button
                  onClick={() => handleDelete(selectedMedia.id)}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 rounded-md text-sm font-medium text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-medium text-gray-900">Generate Image with AI</h2>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Describe the image you want
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
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim()}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm font-medium text-white"
                >
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
