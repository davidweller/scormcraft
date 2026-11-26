import type { CourseApiResponse, ModuleApiResponse, LessonApiResponse, PageApiResponse } from "./api";

export function findPage(
  course: CourseApiResponse,
  pageId: string
): { page: PageApiResponse; lesson: LessonApiResponse; module: ModuleApiResponse } | null {
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      const page = lesson.pages.find((p) => p.id === pageId);
      if (page) return { page, lesson, module: mod };
    }
  }
  return null;
}

export function collectAllPages(course: CourseApiResponse): PageApiResponse[] {
  const pages: PageApiResponse[] = [];
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      pages.push(...lesson.pages);
    }
  }
  return pages.sort((a, b) => a.order - b.order);
}

const WORDS_PER_MINUTE = 200;

function wordCountFromContent(content: unknown): number {
  if (!content || typeof content !== "object") return 0;
  let n = 0;
  const rec = (obj: unknown) => {
    if (typeof obj === "string") {
      n += obj.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;
      return;
    }
    if (Array.isArray(obj)) obj.forEach(rec);
    else if (obj && typeof obj === "object") Object.values(obj).forEach(rec);
  };
  rec(content);
  return n;
}

export function getCourseCounts(course: CourseApiResponse): {
  totalModules: number;
  totalPages: number;
  totalLessons: number;
  totalInteractions: number;
} {
  let totalPages = 0;
  let totalInteractions = 0;
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      totalPages += lesson.pages.length;
      for (const page of lesson.pages) {
        totalInteractions += (page.blocks ?? []).filter(b => b.category === "interaction").length;
      }
    }
  }
  const totalLessons = course.modules.reduce((s, m) => s + (m.lessons?.length ?? 0), 0);
  return {
    totalModules: course.modules?.length ?? 0,
    totalLessons,
    totalPages,
    totalInteractions,
  };
}

/** Estimated seat time in minutes from content word count (read-only). */
export function getEstimatedSeatTimeMinutes(course: CourseApiResponse): number | null {
  let totalWords = 0;
  for (const mod of course.modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      for (const page of lesson.pages ?? []) {
        for (const block of page.blocks ?? []) {
          if (block.category === "content") {
            totalWords += wordCountFromContent(block.data);
          }
        }
      }
    }
  }
  if (totalWords === 0) return null;
  return Math.max(1, Math.round(totalWords / WORDS_PER_MINUTE));
}

/** Completion %: pages that have at least one content block / total pages (0-100). */
export function getCourseCompletion(course: CourseApiResponse): number {
  const pages = collectAllPages(course);
  if (pages.length === 0) return 0;
  const withContent = pages.filter((p) => (p.blocks ?? []).some(b => b.category === "content")).length;
  return Math.round((withContent / pages.length) * 100);
}

export type CourseStatus = "draft" | "ready_to_export";

export function getCourseStatus(course: CourseApiResponse): CourseStatus {
  const { totalPages } = getCourseCounts(course);
  const completion = getCourseCompletion(course);
  if (totalPages === 0 || completion < 50) return "draft";
  return "ready_to_export";
}

export function getFlowCompletion(course: CourseApiResponse): {
  blueprint: boolean;
  generate: boolean;
  interactions: boolean;
  review: boolean;
  preview: boolean;
  export: boolean;
} {
  const { totalModules, totalLessons, totalPages, totalInteractions } = getCourseCounts(course);
  const completion = getCourseCompletion(course);
  const hasStructure = totalModules > 0 && totalLessons > 0;
  const hasContent = totalPages > 0 && completion > 0;
  const hasInteractions = totalInteractions > 0;
  return {
    blueprint: hasStructure,
    generate: hasContent,
    interactions: hasInteractions,
    review: hasContent && hasInteractions,
    preview: hasContent,
    export: hasContent,
  };
}

export type StageStatus = "not_started" | "in_progress" | "complete" | "has_issues";

export interface StageCompletion {
  status: StageStatus;
  subtext: string;
  issueCount?: number;
  isComplete: boolean;
}

export interface FlowCompletionV2 {
  blueprint: StageCompletion;
  generate: StageCompletion;
  interactions: StageCompletion;
  review: StageCompletion;
  preview: StageCompletion;
  export: StageCompletion;
}

export interface CourseIssue {
  type: "empty_page" | "missing_quiz_answer" | "missing_content" | "no_interactions";
  severity: "error" | "warning";
  message: string;
  pageId?: string;
  lessonId?: string;
  moduleId?: string;
  path?: string;
}

export function getCourseIssues(course: CourseApiResponse): CourseIssue[] {
  const issues: CourseIssue[] = [];

  for (const mod of course.modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      for (const page of lesson.pages ?? []) {
        const hasContent = (page.blocks ?? []).some(b => b.category === "content");
        if (!hasContent) {
          issues.push({
            type: "empty_page",
            severity: "error",
            message: `Page "${page.title}" has no content`,
            pageId: page.id,
            lessonId: lesson.id,
            moduleId: mod.id,
            path: `/courses/${course.id}/edit/page/${page.id}`,
          });
        }
      }
      if (lesson.pages.length === 0) {
        issues.push({
          type: "missing_content",
          severity: "warning",
          message: `Lesson "${lesson.title}" has no pages`,
          lessonId: lesson.id,
          moduleId: mod.id,
          path: `/courses/${course.id}/edit`,
        });
      }
    }
    if (mod.lessons.length === 0) {
      issues.push({
        type: "missing_content",
        severity: "warning",
        message: `Module "${mod.title}" has no lessons`,
        moduleId: mod.id,
        path: `/courses/${course.id}/edit`,
      });
    }
  }

  return issues;
}

/** True for courses created by importing a document or a SCORM package. */
export function isImportedCourse(course: { settings?: unknown }): boolean {
  const source = (course.settings as { source?: unknown } | null | undefined)?.source;
  return source === "document" || source === "scorm";
}

export function getFlowCompletionV2(course: CourseApiResponse): FlowCompletionV2 {
  const imported = isImportedCourse(course);
  const { totalModules, totalLessons, totalPages, totalInteractions } = getCourseCounts(course);
  const completion = getCourseCompletion(course);
  const issues = getCourseIssues(course);
  const errorCount = issues.filter((i) => i.severity === "error").length;

  const hasTitle = Boolean(course.title?.trim());
  const hasOverview = Boolean(course.overview?.trim());
  const hasStructure = totalModules > 0 && totalLessons > 0;
  const hasContent = totalPages > 0 && completion > 0;
  const allPagesHaveContent = completion === 100;
  const hasInteractions = totalInteractions > 0;

  const blueprint: StageCompletion = (() => {
    if (!hasTitle) {
      return { status: "not_started", subtext: "Not started", isComplete: false };
    }
    if (!hasStructure) {
      return { status: "in_progress", subtext: "Add modules & lessons", isComplete: false };
    }
    // An imported course arrives with its outline. A missing overview is not
    // a reason to send the author back to the blueprint.
    if (imported) {
      return { status: "complete", subtext: "Imported outline", isComplete: true };
    }
    if (!hasOverview) {
      return { status: "in_progress", subtext: "Add course overview", isComplete: false };
    }
    return { status: "complete", subtext: "Objectives + outline set", isComplete: true };
  })();

  const generate: StageCompletion = (() => {
    if (!hasStructure) {
      return { status: "not_started", subtext: "Complete blueprint first", isComplete: false };
    }
    if (!hasContent) {
      return { status: "not_started", subtext: "Not started", isComplete: false };
    }
    // Imported content counts as done. Empty pages are for the author to fill
    // in the editor, not a cue to generate.
    if (imported) {
      return { status: "complete", subtext: "Imported content", isComplete: true };
    }
    if (!allPagesHaveContent) {
      const pagesWithoutContent = totalPages - Math.round((completion / 100) * totalPages);
      return {
        status: "in_progress",
        subtext: `${pagesWithoutContent} page${pagesWithoutContent !== 1 ? "s" : ""} need content`,
        isComplete: false,
      };
    }
    return { status: "complete", subtext: "Lessons generated", isComplete: true };
  })();

  const interactions: StageCompletion = (() => {
    const interactionsReviewedAt = (course as { interactionsReviewedAt?: string }).interactionsReviewedAt;
    
    if (!hasContent && !hasInteractions) {
      return { status: "not_started", subtext: "Generate lessons first", isComplete: false };
    }
    
    // If user has reviewed the interactions page, mark as complete
    if (interactionsReviewedAt) {
      return { status: "complete", subtext: "Interactions reviewed", isComplete: true };
    }
    
    if (!hasInteractions) {
      if (imported) {
        return { status: "complete", subtext: "Optional", isComplete: true };
      }
      return { status: "not_started", subtext: "No interactions yet", isComplete: false };
    }

    return { status: "complete", subtext: "Interactions added", isComplete: true };
  })();

  const review: StageCompletion = (() => {
    if (!hasContent) {
      return { status: "not_started", subtext: "Generate content first", isComplete: false };
    }
    if (errorCount > 0) {
      return {
        status: "has_issues",
        subtext: `${errorCount} issue${errorCount !== 1 ? "s" : ""} to fix`,
        issueCount: errorCount,
        isComplete: false,
      };
    }
    return { status: "complete", subtext: "Ready", isComplete: true };
  })();

  const preview: StageCompletion = (() => {
    if (!hasContent) {
      return { status: "not_started", subtext: "Generate content first", isComplete: false };
    }
    const lastPreviewedAt = (course as { lastPreviewedAt?: string }).lastPreviewedAt;
    if (!lastPreviewedAt) {
      return { status: "not_started", subtext: "Not viewed yet", isComplete: false };
    }
    return { status: "complete", subtext: "Previewed", isComplete: true };
  })();

  const exportStage: StageCompletion = (() => {
    if (!hasContent) {
      return { status: "not_started", subtext: "Generate content first", isComplete: false };
    }
    if (errorCount > 0) {
      return { status: "has_issues", subtext: "Fix issues first", issueCount: errorCount, isComplete: false };
    }
    const lastExportedAt = (course as { lastExportedAt?: string }).lastExportedAt;
    if (!lastExportedAt) {
      return { status: "not_started", subtext: "Ready to export", isComplete: false };
    }
    return { status: "complete", subtext: "Exported", isComplete: true };
  })();

  return {
    blueprint,
    generate,
    interactions,
    review,
    preview,
    export: exportStage,
  };
}

export function getNextRecommendedAction(course: CourseApiResponse): {
  stage: "blueprint" | "generate" | "interactions" | "review" | "preview" | "export";
  label: string;
  description: string;
  href: string;
  issueCount?: number;
} {
  const flow = getFlowCompletionV2(course);

  // An empty course that wasn't imported: offer the guided build first.
  if (!isImportedCourse(course) && getCourseCounts(course).totalLessons === 0) {
    return {
      stage: "blueprint",
      label: "Build with AI",
      description: "Draft an outline, approve it, then have the lessons written",
      href: `/courses/${course.id}/build`,
    };
  }

  if (!flow.blueprint.isComplete) {
    return {
      stage: "blueprint",
      label: "Complete Blueprint",
      description: "Set up your course structure and objectives",
      href: `/courses/${course.id}/blueprint`,
    };
  }

  if (!flow.generate.isComplete) {
    return {
      stage: "generate",
      label: "Generate Lessons",
      description: flow.generate.subtext,
      href: `/courses/${course.id}/generate`,
    };
  }

  if (!flow.interactions.isComplete) {
    return {
      stage: "interactions",
      label: "Generate Interactions",
      description: flow.interactions.subtext,
      href: `/courses/${course.id}/generate-interactions`,
    };
  }

  if (!flow.review.isComplete) {
    return {
      stage: "review",
      label: "Review Course",
      description: flow.review.subtext,
      href: `/courses/${course.id}/review`,
      issueCount: flow.review.issueCount,
    };
  }

  if (!flow.preview.isComplete) {
    return {
      stage: "preview",
      label: "Preview Course",
      description: "View your course as learners will see it",
      href: `/courses/${course.id}/preview`,
    };
  }

  return {
    stage: "export",
    label: "Export Course",
    description: "Download your SCORM package",
    href: `/courses/${course.id}/export`,
  };
}

export function getModuleStats(module: ModuleApiResponse): {
  lessonCount: number;
  pageCount: number;
  interactionCount: number;
  completionPercent: number;
} {
  const lessons = module.lessons ?? [];
  let pageCount = 0;
  let interactionCount = 0;
  let pagesWithContent = 0;
  for (const lesson of lessons) {
    const pages = lesson.pages ?? [];
    pageCount += pages.length;
    for (const page of pages) {
      const blocks = page.blocks ?? [];
      interactionCount += blocks.filter(b => b.category === "interaction").length;
      if (blocks.some(b => b.category === "content")) pagesWithContent++;
    }
  }
  const completionPercent = pageCount === 0 ? 0 : Math.round((pagesWithContent / pageCount) * 100);
  return {
    lessonCount: lessons.length,
    pageCount,
    interactionCount,
    completionPercent,
  };
}
