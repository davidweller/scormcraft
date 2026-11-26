/**
 * Works out how to save a blueprint without destroying content.
 *
 * Modules and lessons that carry the id of an existing record are updated in
 * place, so their pages and blocks survive. Only records the author removed
 * from the blueprint are deleted.
 */

export interface BlueprintLessonInput {
  id?: string;
  title: string;
}

export interface BlueprintModuleInput {
  id?: string;
  title: string;
  lessons?: BlueprintLessonInput[];
}

export interface ExistingModule {
  id: string;
  lessons: { id: string }[];
}

export interface PlannedLesson {
  /** Existing lesson to update, or undefined to create a new one. */
  id?: string;
  title: string;
  order: number;
}

export interface PlannedModule {
  /** Existing module to update, or undefined to create a new one. */
  id?: string;
  title: string;
  order: number;
  lessons: PlannedLesson[];
}

export interface BlueprintApplyPlan {
  modules: PlannedModule[];
  deleteModuleIds: string[];
  deleteLessonIds: string[];
}

export function planBlueprintApply(
  existing: ExistingModule[],
  input: BlueprintModuleInput[]
): BlueprintApplyPlan {
  const existingModuleIds = new Set(existing.map((m) => m.id));
  const existingLessonIds = new Set(existing.flatMap((m) => m.lessons.map((l) => l.id)));
  const keptModuleIds = new Set<string>();
  const keptLessonIds = new Set<string>();

  const modules: PlannedModule[] = input.map((mod, i) => {
    // An id is honoured once only, and only if it belongs to this course.
    const moduleId =
      mod.id && existingModuleIds.has(mod.id) && !keptModuleIds.has(mod.id) ? mod.id : undefined;
    if (moduleId) keptModuleIds.add(moduleId);

    const lessons: PlannedLesson[] = (mod.lessons ?? []).map((les, j) => {
      const lessonId =
        les.id && existingLessonIds.has(les.id) && !keptLessonIds.has(les.id) ? les.id : undefined;
      if (lessonId) keptLessonIds.add(lessonId);
      return { id: lessonId, title: les.title?.trim() || `Lesson ${j + 1}`, order: j };
    });

    return { id: moduleId, title: mod.title?.trim() || `Module ${i + 1}`, order: i, lessons };
  });

  return {
    modules,
    deleteModuleIds: [...existingModuleIds].filter((id) => !keptModuleIds.has(id)),
    deleteLessonIds: [...existingLessonIds].filter((id) => !keptLessonIds.has(id)),
  };
}
