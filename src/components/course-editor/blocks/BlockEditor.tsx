"use client";

import { useState, useRef, useEffect } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { BlockApiResponse } from "@/lib/api";
import { updateBlock } from "@/lib/api";
import { BlockWrap } from "./BlockWrap";
import MediaPickerModal from "@/components/media/MediaPickerModal";
import type { Media } from "@/types/media";
import { RichTextEditor } from "../RichTextEditor";
import { formatFileSize, getDocumentTypeByMime } from "@/lib/document-files";
import { sanitizeHtmlClient } from "@/lib/html/sanitize-client";

export interface BlockEditorProps {
  courseId: string;
  moduleId: string;
  lessonId: string;
  pageId: string;
  block: BlockApiResponse;
  onRefresh: () => void;
  onDelete: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  isDragging?: boolean;
  style?: React.CSSProperties;
}

export function BlockEditor({
  courseId,
  moduleId,
  lessonId,
  pageId,
  block,
  onRefresh,
  onDelete,
  onRegenerate,
  regenerating,
  dragAttributes,
  dragListeners,
  isDragging,
  style,
}: BlockEditorProps) {
  const [saving, setSaving] = useState(false);

  async function save(data: Record<string, unknown>) {
    setSaving(true);
    try {
      await updateBlock(courseId, moduleId, lessonId, pageId, block.id, { data });
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  const wrapProps = {
    blockId: block.id,
    blockType: block.type,
    variant: block.category as "content" | "interaction",
    saving,
    regenerating,
    onDelete,
    onRegenerate,
    dragAttributes,
    dragListeners,
    isDragging,
    style,
  };

  // Content block types
  if (block.category === "content") {
    if (block.type === "text") {
      return (
        <BlockWrap {...wrapProps}>
          <TextBlockEditor
            data={block.data as { text?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "heading") {
      return (
        <BlockWrap {...wrapProps}>
          <HeadingBlockEditor
            data={block.data as { level?: number; text?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "image") {
      return (
        <BlockWrap {...wrapProps}>
          <ImageBlockEditor
            data={block.data as { url?: string; alt?: string; caption?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "video_embed") {
      return (
        <BlockWrap {...wrapProps}>
          <VideoEmbedBlockEditor
            data={block.data as { url?: string; mimeType?: string; sourceType?: "upload" | "embed" }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "key_insight") {
      return (
        <BlockWrap {...wrapProps}>
          <KeyInsightBlockEditor
            data={block.data as { text?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "key_point") {
      return (
        <BlockWrap {...wrapProps}>
          <KeyPointBlockEditor
            data={block.data as { title?: string; text?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "table") {
      return (
        <BlockWrap {...wrapProps}>
          <TableBlockEditor
            data={block.data as { html?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "file_download") {
      return (
        <BlockWrap {...wrapProps}>
          <FileDownloadBlockEditor
            data={block.data as FileDownloadData}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
  }

  // Interaction block types
  if (block.category === "interaction") {
    if (block.type === "multiple_choice") {
      return (
        <BlockWrap {...wrapProps}>
          <MultipleChoiceEditor
            data={block.data as { question?: string; options?: string[]; correctIndex?: number; explanation?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "true_false") {
      return (
        <BlockWrap {...wrapProps}>
          <TrueFalseEditor
            data={block.data as { question?: string; correct?: boolean; explanation?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "reflection") {
      return (
        <BlockWrap {...wrapProps}>
          <ReflectionEditor
            data={block.data as { prompt?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "drag_and_drop") {
      return (
        <BlockWrap {...wrapProps}>
          <DragAndDropEditor
            data={block.data as { question?: string; items?: string[]; correctOrder?: number[]; explanation?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "matching") {
      return (
        <BlockWrap {...wrapProps}>
          <MatchingEditor
            data={block.data as { question?: string; pairs?: { left: string; right: string }[]; explanation?: string }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
    if (block.type === "dialog_cards") {
      return (
        <BlockWrap {...wrapProps}>
          <DialogCardsEditor
            data={block.data as { title?: string; cards?: { front: string; back: string }[] }}
            onSave={(d) => save(d)}
          />
        </BlockWrap>
      );
    }
  }

  return (
    <BlockWrap {...wrapProps}>
      <p className="text-sm text-gray-400">Unknown block type: {block.type}</p>
    </BlockWrap>
  );
}

// Content block sub-editors

function TextBlockEditor({
  data,
  onSave,
}: {
  data: { text?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(data.text ?? "");

  return (
    <RichTextEditor
      content={text}
      onUpdate={(html) => setText(html)}
      onBlur={() => onSave({ text })}
      placeholder="Enter text…"
    />
  );
}

function HeadingBlockEditor({
  data,
  onSave,
}: {
  data: { level?: number; text?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [level, setLevel] = useState(data.level ?? 1);
  const [text, setText] = useState(data.text ?? "");

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-1">
      <select
        value={level}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLevel(v);
          onSave({ level: v, text });
        }}
        className="rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
      </select>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onSave({ level, text })}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm font-semibold transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Heading text…"
      />
    </div>
  );
}

function ImageBlockEditor({
  data,
  onSave,
}: {
  data: { url?: string; alt?: string; caption?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [url, setUrl] = useState(data.url ?? "");
  const [alt, setAlt] = useState(data.alt ?? "");
  const [caption, setCaption] = useState(data.caption ?? "");
  const [showPicker, setShowPicker] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  function handleMediaSelect(media: Media) {
    setUrl(media.url);
    if (media.alt) setAlt(media.alt);
    onSave({ url: media.url, alt: media.alt || alt, caption });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => onSave({ url, alt, caption })}
          onKeyDown={handleKeyDown}
          className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Image URL"
        />
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="shrink-0 rounded bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
        >
          Browse
        </button>
      </div>
      <input
        type="text"
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        onBlur={() => onSave({ url, alt, caption })}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Alt text"
      />
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => onSave({ url, alt, caption })}
        rows={2}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Description (optional, shown below the image in italics)"
      />
      {url && (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- user-provided URL, preview only */}
          <img src={url} alt={alt || "Preview"} className="max-h-40 rounded object-contain" />
          {caption.trim() && <figcaption className="mt-1 text-sm italic text-gray-600">{caption}</figcaption>}
        </figure>
      )}
      <MediaPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleMediaSelect}
      />
    </div>
  );
}

function VideoEmbedBlockEditor({
  data,
  onSave,
}: {
  data: { url?: string; mimeType?: string; sourceType?: "upload" | "embed" };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [url, setUrl] = useState(data.url ?? "");
  const [mimeType, setMimeType] = useState(data.mimeType ?? "");
  const [sourceType, setSourceType] = useState<"upload" | "embed">(data.sourceType === "upload" ? "upload" : "embed");
  const [showPicker, setShowPicker] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  function handleMediaSelect(media: Media) {
    setUrl(media.url);
    setMimeType(media.mimeType);
    setSourceType("upload");
    onSave({ url: media.url, mimeType: media.mimeType, sourceType: "upload" });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (sourceType === "upload") setSourceType("embed");
          }}
          onBlur={() => onSave({ url, mimeType: sourceType === "upload" ? mimeType : undefined, sourceType })}
          onKeyDown={handleKeyDown}
          className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="YouTube/Vimeo URL or local MP4 URL"
        />
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="shrink-0 rounded bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
        >
          Browse MP4
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Paste an embed URL or choose an uploaded MP4 video to bundle into SCORM.
      </p>
      {url && (sourceType === "upload" || mimeType === "video/mp4" || /\.mp4($|\?)/i.test(url)) && (
        <video
          src={url}
          controls
          preload="metadata"
          className="max-h-56 w-full rounded border border-gray-200 bg-black"
        />
      )}
      <MediaPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleMediaSelect}
        mode="video"
      />
    </div>
  );
}

interface FileDownloadData {
  url?: string;
  filename?: string;
  label?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

function FileDownloadBlockEditor({
  data,
  onSave,
}: {
  data: FileDownloadData;
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [file, setFile] = useState({
    url: data.url ?? "",
    filename: data.filename ?? "",
    mimeType: data.mimeType ?? "",
    size: data.size ?? 0,
  });
  const [label, setLabel] = useState(data.label ?? "");
  const [description, setDescription] = useState(data.description ?? "");
  const [showPicker, setShowPicker] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  function handleMediaSelect(media: Media) {
    const next = { url: media.url, filename: media.filename, mimeType: media.mimeType, size: media.size };
    // Default the link text to the filename without its extension
    const nextLabel = label || media.filename.replace(/\.[^.]+$/, "");
    setFile(next);
    setLabel(nextLabel);
    onSave({ ...next, label: nextLabel, description });
  }

  const typeLabel = getDocumentTypeByMime(file.mimeType)?.label;
  const meta = [typeLabel, formatFileSize(file.size)].filter(Boolean).join(" · ");

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 truncate rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700">
          {file.url ? (
            <>
              <span aria-hidden="true">📄 </span>
              {file.filename}
              {meta && <span className="text-gray-400"> ({meta})</span>}
            </>
          ) : (
            <span className="text-gray-400">No file chosen</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="shrink-0 rounded bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
        >
          {file.url ? "Replace file" : "Choose file"}
        </button>
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => onSave({ ...file, label, description })}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Link text (e.g. Practice data spreadsheet)"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => onSave({ ...file, label, description })}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Description (optional)"
      />
      <p className="text-xs text-gray-500">
        The file is bundled into the SCORM package so learners can download it from the LMS.
      </p>
      <MediaPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={handleMediaSelect}
        mode="file"
      />
    </div>
  );
}

function KeyInsightBlockEditor({
  data,
  onSave,
}: {
  data: { text?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(data.text ?? "");

  return (
    <RichTextEditor
      content={text}
      onUpdate={(html) => setText(html)}
      onBlur={() => onSave({ text })}
      placeholder="Key insight or pull quote (e.g. a short, memorable statement)"
    />
  );
}

function KeyPointBlockEditor({
  data,
  onSave,
}: {
  data: { title?: string; text?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(data.title ?? "");
  const [text, setText] = useState(data.text ?? "");

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => onSave({ title, text })}
        onKeyDown={handleInputKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm font-medium transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Key point title (optional)"
      />
      <RichTextEditor
        content={text}
        onUpdate={(html) => setText(html)}
        onBlur={() => onSave({ title, text })}
        placeholder="Key point content"
      />
    </div>
  );
}

function TableBlockEditor({
  data,
  onSave,
}: {
  data: { html?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [html, setHtml] = useState(data.html ?? "");
  const [isEditing, setIsEditing] = useState(false);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-2">
      {isEditing ? (
        <>
          <label className="block text-xs font-medium text-gray-500">Table HTML</label>
          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            onBlur={() => {
              onSave({ html });
              setIsEditing(false);
            }}
            onKeyDown={handleKeyDown}
            rows={8}
            className="w-full rounded border border-gray-200 px-2 py-1 font-mono text-xs transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="<table>...</table>"
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-500">Table Preview</label>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs text-blue-600 hover:underline"
            >
              Edit HTML
            </button>
          </div>
          {html ? (
            <div
              className="overflow-x-auto rounded border border-gray-200 p-2 text-sm [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-2"
              // Table HTML is hand-authored here and arbitrary after a SCORM
              // import, so it is sanitised before it reaches the DOM.
              dangerouslySetInnerHTML={{ __html: sanitizeHtmlClient(html) }}
            />
          ) : (
            <p className="text-sm text-gray-400 italic">No table content. Click &quot;Edit HTML&quot; to add a table.</p>
          )}
        </>
      )}
    </div>
  );
}

// Interaction block sub-editors

function MultipleChoiceEditor({
  data,
  onSave,
}: {
  data: { question?: string; options?: string[]; correctIndex?: number; explanation?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [question, setQuestion] = useState(data.question ?? "");
  const [options, setOptions] = useState<string[]>(Array.isArray(data.options) && data.options.length > 0 ? data.options : ["", ""]);
  const [correctIndex, setCorrectIndex] = useState(Math.max(0, data.correctIndex ?? 0));
  const [explanation, setExplanation] = useState(data.explanation ?? "");

  const save = () => {
    const opts = options.filter((o) => o.trim() !== "");
    if (opts.length === 0) return;
    onSave({
      question,
      options: opts,
      correctIndex: Math.min(correctIndex, opts.length - 1),
      explanation: explanation.trim() || undefined,
    });
  };

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-500">Question</label>
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Question text…"
      />
      <label className="block text-xs font-medium text-gray-500">Options (select correct)</label>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name="correct"
            checked={correctIndex === i}
            onChange={() => {
              setCorrectIndex(i);
              onSave({ question, options, correctIndex: i, explanation });
            }}
            aria-label={`Option ${i + 1} is correct`}
          />
          <input
            type="text"
            value={opt}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              setOptions(next);
            }}
            onBlur={save}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`Option ${i + 1}`}
          />
          {options.length > 2 && (
            <button
              type="button"
              onClick={() => {
                const next = options.filter((_, j) => j !== i);
                setOptions(next);
                setCorrectIndex((prev) => (prev >= next.length ? next.length - 1 : prev));
                onSave({
                  question,
                  options: next,
                  correctIndex: correctIndex >= next.length ? next.length - 1 : correctIndex,
                  explanation,
                });
              }}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setOptions([...options, ""]);
        }}
        className="text-xs text-blue-600 hover:underline"
      >
        + Add option
      </button>
      <div>
        <label className="block text-xs font-medium text-gray-500">Explanation (optional)</label>
        <input
          type="text"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Shown after answer"
        />
      </div>
    </div>
  );
}

function TrueFalseEditor({
  data,
  onSave,
}: {
  data: { question?: string; correct?: boolean; explanation?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [question, setQuestion] = useState(data.question ?? "");
  const [correct, setCorrect] = useState(data.correct ?? true);
  const [explanation, setExplanation] = useState(data.explanation ?? "");

  const save = () => onSave({ question, correct, explanation: explanation.trim() || undefined });

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-500">Question</label>
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="True or false statement…"
      />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1 text-sm">
          <input
            type="radio"
            checked={correct === true}
            onChange={() => {
              setCorrect(true);
              onSave({ question, correct: true, explanation });
            }}
          />
          True
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="radio"
            checked={correct === false}
            onChange={() => {
              setCorrect(false);
              onSave({ question, correct: false, explanation });
            }}
          />
          False
        </label>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500">Explanation (optional)</label>
        <input
          type="text"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Shown after answer"
        />
      </div>
    </div>
  );
}

function ReflectionEditor({
  data,
  onSave,
}: {
  data: { prompt?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [prompt, setPrompt] = useState(data.prompt ?? "");

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500">Reflection prompt (non-graded)</label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onBlur={() => onSave({ prompt })}
        onKeyDown={handleKeyDown}
        rows={2}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="e.g. What did you find most useful?"
      />
    </div>
  );
}

function DragAndDropEditor({
  data,
  onSave,
}: {
  data: { question?: string; items?: string[]; correctOrder?: number[]; explanation?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [question, setQuestion] = useState(data.question ?? "");
  const [items, setItems] = useState<string[]>(
    Array.isArray(data.items) && data.items.length > 0 ? data.items : ["", ""]
  );
  const [explanation, setExplanation] = useState(data.explanation ?? "");

  const save = () => {
    const filteredItems = items.filter((item) => item.trim() !== "");
    if (filteredItems.length === 0) return;
    const correctOrder = filteredItems.map((_, i) => i);
    onSave({
      question,
      items: filteredItems,
      correctOrder,
      explanation: explanation.trim() || undefined,
    });
  };

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-500">Question</label>
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="e.g. Put these steps in order…"
      />
      <label className="block text-xs font-medium text-gray-500">Items (in correct order)</label>
      <p className="text-xs text-gray-400">Enter items in the correct sequence. They will be shuffled for learners.</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-center text-xs text-gray-400">{i + 1}.</span>
          <input
            type="text"
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              setItems(next);
            }}
            onBlur={save}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`Item ${i + 1}`}
          />
          {items.length > 2 && (
            <button
              type="button"
              onClick={() => {
                const next = items.filter((_, j) => j !== i);
                setItems(next);
                const correctOrder = next.filter((x) => x.trim()).map((_, idx) => idx);
                onSave({ question, items: next.filter((x) => x.trim()), correctOrder, explanation });
              }}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setItems([...items, ""])}
        className="text-xs text-blue-600 hover:underline"
      >
        + Add item
      </button>
      <div>
        <label className="block text-xs font-medium text-gray-500">Explanation (optional)</label>
        <input
          type="text"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Shown after answer"
        />
      </div>
    </div>
  );
}

function MatchingEditor({
  data,
  onSave,
}: {
  data: { question?: string; pairs?: { left: string; right: string }[]; explanation?: string };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [question, setQuestion] = useState(data.question ?? "");
  const [pairs, setPairs] = useState<{ left: string; right: string }[]>(
    Array.isArray(data.pairs) && data.pairs.length > 0
      ? data.pairs
      : [{ left: "", right: "" }, { left: "", right: "" }]
  );
  const [explanation, setExplanation] = useState(data.explanation ?? "");

  const save = () => {
    const filteredPairs = pairs.filter((p) => p.left.trim() !== "" || p.right.trim() !== "");
    if (filteredPairs.length === 0) return;
    onSave({
      question,
      pairs: filteredPairs,
      explanation: explanation.trim() || undefined,
    });
  };

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-500">Question</label>
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="e.g. Match the terms to their definitions…"
      />
      <label className="block text-xs font-medium text-gray-500">Pairs (left matches right)</label>
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={pair.left}
            onChange={(e) => {
              const next = [...pairs];
              next[i] = { ...next[i], left: e.target.value };
              setPairs(next);
            }}
            onBlur={save}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Left item"
          />
          <span className="text-gray-400">↔</span>
          <input
            type="text"
            value={pair.right}
            onChange={(e) => {
              const next = [...pairs];
              next[i] = { ...next[i], right: e.target.value };
              setPairs(next);
            }}
            onBlur={save}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Right item"
          />
          {pairs.length > 2 && (
            <button
              type="button"
              onClick={() => {
                const next = pairs.filter((_, j) => j !== i);
                setPairs(next);
                onSave({ question, pairs: next.filter((p) => p.left.trim() || p.right.trim()), explanation });
              }}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setPairs([...pairs, { left: "", right: "" }])}
        className="text-xs text-blue-600 hover:underline"
      >
        + Add pair
      </button>
      <div>
        <label className="block text-xs font-medium text-gray-500">Explanation (optional)</label>
        <input
          type="text"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Shown after answer"
        />
      </div>
    </div>
  );
}

function DialogCardsEditor({
  data,
  onSave,
}: {
  data: { title?: string; cards?: { front: string; back: string }[] };
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(data.title ?? "");
  const [cards, setCards] = useState<{ front: string; back: string }[]>(
    Array.isArray(data.cards) && data.cards.length > 0
      ? data.cards
      : [{ front: "", back: "" }]
  );

  const save = () => {
    const filteredCards = cards.filter((c) => c.front.trim() !== "" || c.back.trim() !== "");
    if (filteredCards.length === 0) return;
    onSave({
      title: title.trim() || undefined,
      cards: filteredCards,
    });
  };

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-gray-500">Title (optional)</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="e.g. Key Terms Review"
      />
      <label className="block text-xs font-medium text-gray-500">Cards (non-graded flip cards)</label>
      {cards.map((card, i) => (
        <div key={i} className="rounded border border-gray-200 bg-gray-50 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Card {i + 1}</span>
            {cards.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const next = cards.filter((_, j) => j !== i);
                  setCards(next);
                  onSave({ title, cards: next.filter((c) => c.front.trim() || c.back.trim()) });
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <input
            type="text"
            value={card.front}
            onChange={(e) => {
              const next = [...cards];
              next[i] = { ...next[i], front: e.target.value };
              setCards(next);
            }}
            onBlur={save}
            onKeyDown={handleKeyDown}
            className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Front (question/term)"
          />
          <textarea
            value={card.back}
            onChange={(e) => {
              const next = [...cards];
              next[i] = { ...next[i], back: e.target.value };
              setCards(next);
            }}
            onBlur={save}
            onKeyDown={handleKeyDown}
            rows={2}
            className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Back (answer/definition)"
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() => setCards([...cards, { front: "", back: "" }])}
        className="text-xs text-blue-600 hover:underline"
      >
        + Add card
      </button>
    </div>
  );
}
