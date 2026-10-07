import type { BrandConfig } from "./branding";

export type BlockCategory = "content" | "interaction";

export type ContentBlockType =
  | "text"
  | "heading"
  | "image"
  | "video_embed"
  | "key_insight"
  | "key_point"
  | "table"
  | "file_download"
  | "embedded_html";
export type InteractionBlockType =
  | "multiple_choice"
  | "true_false"
  | "reflection"
  | "drag_and_drop"
  | "matching"
  | "dialog_cards";

export type BlockType = ContentBlockType | InteractionBlockType;

/**
 * Canonical block-type registry. Previously these lists were duplicated in
 * BlockList.tsx, the blocks POST route and this file; a type added to one and
 * missed in another is accepted in one place and rejected in the next.
 * Everything that needs to enumerate block types imports from here.
 */
export const CONTENT_BLOCK_TYPES: readonly ContentBlockType[] = [
  "text",
  "heading",
  "image",
  "video_embed",
  "key_insight",
  "key_point",
  "table",
  "file_download",
  "embedded_html",
];

export const INTERACTION_BLOCK_TYPES: readonly InteractionBlockType[] = [
  "multiple_choice",
  "true_false",
  "reflection",
  "drag_and_drop",
  "matching",
  "dialog_cards",
];

/**
 * Types the import pipeline may create but a user may not author by hand.
 * `embedded_html` carries a reference to a preserved page bundle; there is
 * nothing a creation form could produce that would be valid.
 */
export const SYSTEM_BLOCK_TYPES: readonly BlockType[] = ["embedded_html"];

export function isSystemBlockType(type: string): boolean {
  return SYSTEM_BLOCK_TYPES.includes(type as BlockType);
}

/** Content types offered in the editor's "add block" menu. */
export const AUTHORABLE_CONTENT_BLOCK_TYPES: readonly ContentBlockType[] =
  CONTENT_BLOCK_TYPES.filter((t) => !isSystemBlockType(t));

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  text: "Text",
  heading: "Heading",
  image: "Image",
  video_embed: "Video",
  key_insight: "Key insight",
  key_point: "Key point",
  table: "Table",
  file_download: "File download",
  embedded_html: "Preserved page",
  multiple_choice: "Multiple choice",
  true_false: "True / False",
  reflection: "Reflection",
  drag_and_drop: "Drag & Drop",
  matching: "Matching",
  dialog_cards: "Dialog Cards",
};

export type ContentData = Record<string, unknown>;

export type InteractionData =
  | MultipleChoiceConfig
  | TrueFalseConfig
  | ReflectionConfig
  | DragAndDropConfig
  | MatchingConfig
  | DialogCardsConfig;

export interface BlockData {
  id: string;
  pageId: string;
  category: BlockCategory;
  type: BlockType;
  data: ContentData | InteractionData;
  order: number;
}

export interface ContentBlockData {
  id: string;
  pageId: string;
  category: "content";
  type: ContentBlockType;
  data: ContentData;
  order: number;
}

export interface InteractionBlockData {
  id: string;
  pageId: string;
  category: "interaction";
  type: InteractionBlockType;
  data: InteractionData;
  order: number;
}

export function isContentBlock(block: BlockData): block is ContentBlockData {
  return block.category === "content";
}

export function isInteractionBlock(block: BlockData): block is InteractionBlockData {
  return block.category === "interaction";
}

export interface MultipleChoiceConfig {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface TrueFalseConfig {
  question: string;
  correct: boolean;
  explanation?: string;
}

export interface ReflectionConfig {
  prompt: string;
}

export interface DragAndDropConfig {
  question: string;
  items: string[];
  correctOrder: number[];
  explanation?: string;
}

export interface MatchingConfig {
  question: string;
  pairs: { left: string; right: string }[];
  explanation?: string;
}

export interface DialogCardsConfig {
  title?: string;
  cards: { front: string; back: string }[];
}

export type InteractionDensity = "light" | "moderate" | "heavy";

export interface InteractionPlacement {
  withinLessons: boolean;
  endOfModule: boolean;
  finalAssessment: boolean;
}

export interface InteractionConfig {
  enabledTypes: InteractionBlockType[];
  density: InteractionDensity;
  placement: InteractionPlacement;
  includeExplanations: boolean;
}

export interface PageData {
  id: string;
  lessonId: string;
  title: string;
  order: number;
  completionRules?: Record<string, unknown> | null;
  blocks: BlockData[];
}

export interface LessonData {
  id: string;
  moduleId: string;
  title: string;
  order: number;
  pages: PageData[];
}

export interface ModuleData {
  id: string;
  courseId: string;
  title: string;
  order: number;
  lessons: LessonData[];
}

export interface CourseData {
  id: string;
  title: string;
  overview: string | null;
  brandConfig: BrandConfig | null;
  createdAt: string;
  updatedAt: string;
  modules: ModuleData[];
}
