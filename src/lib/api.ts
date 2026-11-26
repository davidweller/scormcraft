/**
 * Client-side API helpers for course CRUD. All paths are relative for same-origin.
 */

const base = "";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function fetchCourse(courseId: string) {
  return json<CourseApiResponse>(await fetch(`${base}/api/courses/${courseId}`));
}

export async function updateCourse(
  courseId: string,
  data: {
    title?: string;
    overview?: string;
    audience?: string;
    targetWordCount?: number | null;
    tone?: string;
    complianceLevel?: string;
    brandConfig?: unknown;
    settings?: unknown;
    ilos?: unknown;
    assessmentPlan?: unknown;
  }
) {
  return json<unknown>(await fetch(`${base}/api/courses/${courseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
}

export async function createModule(courseId: string, data: { title: string; order?: number }) {
  return json<{ id: string }>(await fetch(`${base}/api/courses/${courseId}/modules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
}

export async function updateModule(courseId: string, moduleId: string, data: { title?: string; order?: number }) {
  return json<unknown>(await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
}

export async function deleteModule(courseId: string, moduleId: string) {
  const res = await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
}

export async function createLesson(courseId: string, moduleId: string, data: { title: string; order?: number }) {
  return json<{ id: string }>(await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}/lessons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
}

export async function updateLesson(courseId: string, moduleId: string, lessonId: string, data: { title?: string; order?: number }) {
  return json<unknown>(await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
}

export async function deleteLesson(courseId: string, moduleId: string, lessonId: string) {
  const res = await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
}

export async function createPage(courseId: string, moduleId: string, lessonId: string, data: { title: string; order?: number }) {
  return json<{ id: string }>(await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/pages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }));
}

export async function updatePage(
  courseId: string,
  moduleId: string,
  lessonId: string,
  pageId: string,
  data: { title?: string; order?: number; completionRules?: unknown }
) {
  return json<unknown>(
    await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  );
}

export async function deletePage(courseId: string, moduleId: string, lessonId: string, pageId: string) {
  const res = await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/pages/${pageId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
}

function blockPath(courseId: string, moduleId: string, lessonId: string, pageId: string) {
  return `${base}/api/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/pages/${pageId}`;
}

// Unified block API functions
export async function createBlock(
  courseId: string,
  moduleId: string,
  lessonId: string,
  pageId: string,
  data: { category: "content" | "interaction"; type: string; data?: Record<string, unknown>; order?: number }
) {
  return json<BlockApiResponse>(
    await fetch(`${blockPath(courseId, moduleId, lessonId, pageId)}/blocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  );
}

export async function updateBlock(
  courseId: string,
  moduleId: string,
  lessonId: string,
  pageId: string,
  blockId: string,
  data: { type?: string; data?: Record<string, unknown>; order?: number }
) {
  return json<BlockApiResponse>(
    await fetch(`${blockPath(courseId, moduleId, lessonId, pageId)}/blocks/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  );
}

export async function deleteBlock(
  courseId: string,
  moduleId: string,
  lessonId: string,
  pageId: string,
  blockId: string
) {
  const res = await fetch(`${blockPath(courseId, moduleId, lessonId, pageId)}/blocks/${blockId}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
}

export async function reorderBlocks(
  courseId: string,
  moduleId: string,
  lessonId: string,
  pageId: string,
  orderUpdates: { id: string; order: number }[]
) {
  return json<unknown>(
    await fetch(`${blockPath(courseId, moduleId, lessonId, pageId)}/blocks/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderUpdates }),
    })
  );
}

/**
 * Asks the AI for a new version of a block. With `preview`, nothing is saved:
 * the returned block carries the proposed data for the author to accept.
 */
export async function regenerateBlock(
  courseId: string,
  pageId: string,
  blockId: string,
  options: { preview?: boolean } = {}
) {
  return json<{ success: boolean; block: BlockApiResponse }>(
    await fetch(`${base}/api/courses/${courseId}/pages/${pageId}/blocks/${blockId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview: options.preview === true }),
    })
  );
}

// Types matching API responses (course tree)
export interface CourseApiResponse {
  id: string;
  title: string;
  overview: string | null;
  audience: string | null;
  targetWordCount: number | null;
  tone: string | null;
  complianceLevel: string | null;
  brandConfig: unknown;
  settings: unknown;
  ilos: string[] | null;
  assessmentPlan: unknown;
  createdAt: string;
  updatedAt: string;
  modules: ModuleApiResponse[];
}

export interface ModuleApiResponse {
  id: string;
  courseId: string;
  title: string;
  order: number;
  lessons: LessonApiResponse[];
}

export interface LessonApiResponse {
  id: string;
  moduleId: string;
  title: string;
  order: number;
  pages: PageApiResponse[];
}

export interface PageApiResponse {
  id: string;
  lessonId: string;
  title: string;
  order: number;
  completionRules: unknown;
  blocks: BlockApiResponse[];
}

export interface BlockApiResponse {
  id: string;
  pageId: string;
  category: "content" | "interaction";
  type: string;
  data: Record<string, unknown>;
  order: number;
}

/** Saves a rearranged outline. See src/lib/outline.ts for building one. */
export async function saveStructure(
  courseId: string,
  outline: { modules: { id: string; lessons: { id: string; pages: string[] }[] }[] }
) {
  return json<{ success: boolean }>(
    await fetch(`${base}/api/courses/${courseId}/structure`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(outline),
    })
  );
}

/** Copies a lesson or page, placing the copy after the original. */
export async function duplicateOutlineItem(courseId: string, kind: "lesson" | "page", id: string) {
  return json<{ id: string; pageId: string | null }>(
    await fetch(`${base}/api/courses/${courseId}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id }),
    })
  );
}

export async function duplicateModule(courseId: string, moduleId: string) {
  return json<{ id: string }>(
    await fetch(`${base}/api/courses/${courseId}/modules/${moduleId}/duplicate`, { method: "POST" })
  );
}
