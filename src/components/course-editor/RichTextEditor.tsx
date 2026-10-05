"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback, useState } from "react";

interface RichTextEditorProps {
  content: string;
  onUpdate: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  content,
  onUpdate,
  onBlur,
  placeholder = "Enter text…",
  className = "",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        code: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          protocols: ["mailto"],
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[1.5rem]",
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const handleBlur = useCallback(() => {
    onBlur?.();
  }, [onBlur]);

  // null = link input closed; otherwise the URL being edited.
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const openLinkInput = useCallback(() => {
    if (!editor) return;
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor || linkUrl === null) return;
    let url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      if (!/^(https?:\/\/|mailto:)/i.test(url)) url = url.includes("@") && !url.includes("/") ? `mailto:${url}` : `https://${url}`;
      const chain = editor.chain().focus().extendMarkRange("link");
      // With nothing selected, insert the URL itself as the link text.
      if (editor.state.selection.empty && !editor.isActive("link")) {
        chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
      } else {
        chain.setLink({ href: url }).run();
      }
    }
    setLinkUrl(null);
  }, [editor, linkUrl]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`rich-text-editor ${className}`}>
      <style jsx global>{`
        .rich-text-editor .ProseMirror {
          outline: none;
          min-height: 1.5rem;
        }
        .rich-text-editor .ProseMirror p {
          margin: 0;
        }
        .rich-text-editor .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .rich-text-editor .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.5em 0;
        }
        .rich-text-editor .ProseMirror li {
          margin: 0.25em 0;
        }
        .rich-text-editor .ProseMirror li p {
          margin: 0;
        }
        .rich-text-editor .ProseMirror strong {
          font-weight: 600;
        }
        .rich-text-editor .ProseMirror em {
          font-style: italic;
        }
        .rich-text-editor .ProseMirror a {
          color: #2563eb;
          text-decoration: underline;
        }
        .rich-text-editor .ProseMirror .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
      `}</style>
      <div className="flex items-center gap-1 border-b border-gray-200 pb-1 mb-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Bold (Ctrl+B)"
        >
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Italic (Ctrl+I)"
        >
          <ItalicIcon />
        </ToolbarButton>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarButton
          onClick={openLinkInput}
          isActive={editor.isActive("link") || linkUrl !== null}
          title="Link (select text first)"
        >
          <LinkIcon />
        </ToolbarButton>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <BulletListIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Numbered List"
        >
          <NumberedListIcon />
        </ToolbarButton>
      </div>
      {linkUrl !== null && (
        <div className="mb-1 flex items-center gap-1">
          <input
            type="url"
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                setLinkUrl(null);
                editor.commands.focus();
              }
            }}
            placeholder="https://example.com"
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-0.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyLink}
            className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700"
          >
            Apply
          </button>
          {editor.isActive("link") && (
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setLinkUrl(null);
              }}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Remove
            </button>
          )}
        </div>
      )}
      <EditorContent
        editor={editor}
        onBlur={handleBlur}
        className="w-full rounded border border-gray-200 px-2 py-1 text-sm transition-colors focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  isActive,
  title,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition-colors ${
        isActive
          ? "bg-blue-100 text-blue-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

function BoldIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
    </svg>
  );
}

export default RichTextEditor;
