/**
 * Moving modules, lessons and pages around the course outline.
 *
 * Every function is pure: it takes the current modules and returns new ones,
 * or null when the move makes no sense. The result is sent to the structure
 * endpoint as a plain outline of ids.
 */

export type OutlineKind = "module" | "lesson" | "page";

export interface OutlinePage {
  id: string;
}
export interface OutlineLesson<P extends OutlinePage = OutlinePage> {
  id: string;
  pages: P[];
}
export interface OutlineModule<L extends OutlineLesson = OutlineLesson> {
  id: string;
  lessons: L[];
}

/** The payload for PATCH /api/courses/{id}/structure. */
export interface OutlinePayload {
  modules: { id: string; lessons: { id: string; pages: string[] }[] }[];
}

export function toOutline(modules: OutlineModule[]): OutlinePayload {
  return {
    modules: modules.map((m) => ({
      id: m.id,
      lessons: m.lessons.map((l) => ({ id: l.id, pages: l.pages.map((p) => p.id) })),
    })),
  };
}

function clone<M extends OutlineModule>(modules: M[]): M[] {
  return modules.map((m) => ({
    ...m,
    lessons: m.lessons.map((l) => ({ ...l, pages: [...l.pages] })),
  }));
}

function findLesson(modules: OutlineModule[], lessonId: string) {
  for (let mi = 0; mi < modules.length; mi++) {
    const li = modules[mi].lessons.findIndex((l) => l.id === lessonId);
    if (li !== -1) return { mi, li };
  }
  return null;
}

function findPage(modules: OutlineModule[], pageId: string) {
  for (let mi = 0; mi < modules.length; mi++) {
    for (let li = 0; li < modules[mi].lessons.length; li++) {
      const pi = modules[mi].lessons[li].pages.findIndex((p) => p.id === pageId);
      if (pi !== -1) return { mi, li, pi };
    }
  }
  return null;
}

/** Which kind of item an id belongs to, or null if it isn't in the outline. */
export function kindOf(modules: OutlineModule[], id: string): OutlineKind | null {
  if (modules.some((m) => m.id === id)) return "module";
  if (findLesson(modules, id)) return "lesson";
  if (findPage(modules, id)) return "page";
  return null;
}

export type Placement = "before" | "after";

/**
 * Moves `activeId` next to `targetId`.
 *
 * A target of the same kind places the item before or after it. A target one
 * level up (a module for a lesson, a lesson for a page) places the item
 * inside it: first when `place` is "after" (dropped just below the header),
 * last when "before" (dropped just above the next header).
 */
export function moveNextTo<M extends OutlineModule>(
  modules: M[],
  activeId: string,
  targetId: string,
  place: Placement
): M[] | null {
  if (activeId === targetId) return null;
  const kind = kindOf(modules, activeId);
  const targetKind = kindOf(modules, targetId);
  if (!kind || !targetKind) return null;
  const next = clone(modules);

  if (kind === "module") {
    // A module can be dropped on anything: it lands beside that item's module.
    const targetModuleIndex =
      targetKind === "module"
        ? next.findIndex((m) => m.id === targetId)
        : (targetKind === "lesson" ? findLesson(next, targetId) : findPage(next, targetId))!.mi;
    const targetModuleId = next[targetModuleIndex].id;
    if (targetModuleId === activeId) return null;
    const from = next.findIndex((m) => m.id === activeId);
    const [item] = next.splice(from, 1);
    const to = next.findIndex((m) => m.id === targetModuleId) + (place === "after" ? 1 : 0);
    next.splice(to, 0, item);
    return next;
  }

  if (kind === "lesson") {
    const from = findLesson(next, activeId)!;
    if (targetKind === "page") {
      // Treat a page as standing for its lesson.
      const t = findPage(next, targetId)!;
      return moveNextTo(modules, activeId, next[t.mi].lessons[t.li].id, place);
    }
    const [item] = next[from.mi].lessons.splice(from.li, 1);
    if (targetKind === "module") {
      const target = next.find((m) => m.id === targetId)!;
      if (place === "after") target.lessons.unshift(item);
      else target.lessons.push(item);
      return next;
    }
    const t = findLesson(next, targetId)!;
    next[t.mi].lessons.splice(t.li + (place === "after" ? 1 : 0), 0, item);
    return next;
  }

  // kind === "page"
  if (targetKind === "module") return null;
  const from = findPage(next, activeId)!;
  const [item] = next[from.mi].lessons[from.li].pages.splice(from.pi, 1);
  if (targetKind === "lesson") {
    const t = findLesson(next, targetId)!;
    const pages = next[t.mi].lessons[t.li].pages;
    if (place === "after") pages.unshift(item);
    else pages.push(item);
    return next;
  }
  const t = findPage(next, targetId)!;
  next[t.mi].lessons[t.li].pages.splice(t.pi + (place === "after" ? 1 : 0), 0, item);
  return next;
}

/**
 * Moves an item one place up or down. At the edge of its parent it crosses
 * into the neighbouring parent: a lesson at the top of a module moves to the
 * end of the module above.
 */
export function moveBy<M extends OutlineModule>(
  modules: M[],
  id: string,
  direction: "up" | "down"
): M[] | null {
  const kind = kindOf(modules, id);
  if (!kind) return null;
  const next = clone(modules);
  const step = direction === "up" ? -1 : 1;

  if (kind === "module") {
    const from = next.findIndex((m) => m.id === id);
    const to = from + step;
    if (to < 0 || to >= next.length) return null;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }

  if (kind === "lesson") {
    const { mi, li } = findLesson(next, id)!;
    const lessons = next[mi].lessons;
    const to = li + step;
    if (to >= 0 && to < lessons.length) {
      const [item] = lessons.splice(li, 1);
      lessons.splice(to, 0, item);
      return next;
    }
    const neighbour = next[mi + step];
    if (!neighbour) return null;
    const [item] = lessons.splice(li, 1);
    if (direction === "up") neighbour.lessons.push(item);
    else neighbour.lessons.unshift(item);
    return next;
  }

  const { mi, li, pi } = findPage(next, id)!;
  const pages = next[mi].lessons[li].pages;
  const to = pi + step;
  if (to >= 0 && to < pages.length) {
    const [item] = pages.splice(pi, 1);
    pages.splice(to, 0, item);
    return next;
  }
  // Cross into the neighbouring lesson, which may be in the next module.
  const flat = next.flatMap((m) => m.lessons);
  const here = flat.findIndex((l) => l.id === next[mi].lessons[li].id);
  const neighbour = flat[here + step];
  if (!neighbour) return null;
  const [item] = pages.splice(pi, 1);
  if (direction === "up") neighbour.pages.push(item);
  else neighbour.pages.unshift(item);
  return next;
}

/** Moves a lesson to the end of a module, or a page to the end of a lesson. */
export function moveToParent<M extends OutlineModule>(
  modules: M[],
  id: string,
  parentId: string
): M[] | null {
  const kind = kindOf(modules, id);
  const next = clone(modules);
  if (kind === "lesson") {
    const from = findLesson(next, id)!;
    const target = next.find((m) => m.id === parentId);
    if (!target || next[from.mi].id === parentId) return null;
    const [item] = next[from.mi].lessons.splice(from.li, 1);
    target.lessons.push(item);
    return next;
  }
  if (kind === "page") {
    const from = findPage(next, id)!;
    const t = findLesson(next, parentId);
    if (!t || next[from.mi].lessons[from.li].id === parentId) return null;
    const [item] = next[from.mi].lessons[from.li].pages.splice(from.pi, 1);
    next[t.mi].lessons[t.li].pages.push(item);
    return next;
  }
  return null;
}

/**
 * Checks a submitted outline against what the course holds. Every existing
 * module, lesson and page must appear exactly once, and nothing else may.
 */
export function outlineMatches(existing: OutlinePayload, submitted: OutlinePayload): boolean {
  const ids = (o: OutlinePayload) => ({
    modules: o.modules.map((m) => m.id),
    lessons: o.modules.flatMap((m) => m.lessons.map((l) => l.id)),
    pages: o.modules.flatMap((m) => m.lessons.flatMap((l) => l.pages)),
  });
  const same = (a: string[], b: string[]) =>
    a.length === b.length && new Set(b).size === b.length && a.every((id) => b.includes(id));
  const a = ids(existing);
  const b = ids(submitted);
  return same(a.modules, b.modules) && same(a.lessons, b.lessons) && same(a.pages, b.pages);
}
