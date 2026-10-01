/**
 * Downloadable document types for the file_download block.
 * Shared by the upload route, the media picker, and the SCORM renderer, so it must stay free of Node imports.
 */

export interface DocumentType {
  ext: string;
  mimeType: string;
  label: string;
}

const DOCUMENT_TYPES: DocumentType[] = [
  { ext: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  { ext: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  { ext: "pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint" },
  { ext: "pdf", mimeType: "application/pdf", label: "PDF" },
  { ext: "csv", mimeType: "text/csv", label: "CSV" },
];

/** Browsers report these for documents they don't recognise (and Windows reports CSV as Excel). */
const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream", "application/zip", "application/vnd.ms-excel"]);

export const DOCUMENT_MAX_SIZE = 4.5 * 1024 * 1024;

export const DOCUMENT_ACCEPT = DOCUMENT_TYPES.map((t) => `.${t.ext}`).join(",");

export const DOCUMENT_EXTENSIONS_LABEL = DOCUMENT_TYPES.map((t) => t.ext.toUpperCase()).join(", ");

export function getDocumentTypeByFilename(filename: string): DocumentType | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return DOCUMENT_TYPES.find((t) => t.ext === ext) ?? null;
}

export function getDocumentTypeByMime(mimeType: string): DocumentType | null {
  return DOCUMENT_TYPES.find((t) => t.mimeType === mimeType) ?? null;
}

/** The extension decides the type; the browser-reported MIME must agree or be one of the generic values. */
export function resolveUploadedDocument(filename: string, reportedMime: string): DocumentType | null {
  const type = getDocumentTypeByFilename(filename);
  if (!type) return null;
  if (reportedMime === type.mimeType || GENERIC_MIME_TYPES.has(reportedMime)) return type;
  return null;
}

export function isDocumentMime(mimeType: string): boolean {
  return getDocumentTypeByMime(mimeType) !== null;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
