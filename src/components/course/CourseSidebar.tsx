"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CourseApiResponse } from "@/lib/api";
import { getFlowCompletionV2 } from "@/lib/course-tree";
import { SidebarSection, BuildStageItem, CourseSwitcher } from "./sidebar";
import {
  Bars3Icon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  Cog6ToothIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  SparklesIcon,
  Squares2X2Icon,
  ClockIcon,
} from "@heroicons/react/24/outline";

// Labels match the headings of the pages they open.
const BUILD_STAGES = [
  { key: "blueprint", label: "Blueprint", path: "blueprint" },
  { key: "generate", label: "Generate Lessons", path: "generate" },
  { key: "interactions", label: "Generate Interactions", path: "generate-interactions" },
  { key: "review", label: "Review", path: "review" },
  { key: "preview", label: "Preview", path: "preview" },
  { key: "export", label: "Export", path: "export" },
] as const;

const COURSE_ITEMS = [
  { path: "", label: "Overview", icon: Squares2X2Icon },
  { path: "edit", label: "Edit content", icon: PencilSquareIcon },
  { path: "interactions", label: "Interactions", icon: SparklesIcon },
  { path: "branding", label: "Branding", icon: PaintBrushIcon },
  { path: "history", label: "History", icon: ClockIcon },
  { path: "settings", label: "Settings", icon: Cog6ToothIcon },
];

/**
 * The frame around every course screen: the course sidebar plus the page.
 * In the editor the sidebar shrinks to an icon rail, so the outline tree is
 * the only wide panel beside the canvas.
 */
export function CourseShell({ courseId, children }: { courseId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [course, setCourse] = useState<CourseApiResponse | null>(null);
  // null follows the default for the current screen; a boolean is the author's choice.
  const [railChoice, setRailChoice] = useState<boolean | null>(null);

  const basePath = `/courses/${courseId}`;
  const currentSegment = pathname?.replace(basePath, "").replace(/^\//, "").split("/")[0] ?? "";
  const inEditor = currentSegment === "edit";
  const rail = railChoice ?? inEditor;

  // Refetched on navigation so the stage ticks reflect what was just done.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/${courseId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CourseApiResponse | null) => {
        if (!cancelled && data) setCourse(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [courseId, pathname]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const flow = course ? getFlowCompletionV2(course) : null;

  return (
    <div className="flex min-h-[calc(100vh-3rem)]">
      <aside
        className={`fixed bottom-0 left-0 top-12 z-20 flex flex-col border-r border-gray-200 bg-surface shadow-sm transition-transform lg:sticky lg:top-12 lg:z-0 lg:h-[calc(100vh-3rem)] lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          rail ? "w-64 lg:w-14" : "w-64"
        } ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Course"
      >
        <div className={rail ? "lg:hidden" : ""}>
          <CourseSwitcher currentCourseId={courseId} currentCourseTitle={course?.title ?? ""} />
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="border-t border-gray-200">
            <SidebarSection title="Course" hideTitle={rail}>
              <nav className="space-y-0.5 px-1" aria-label="Course sections">
                {COURSE_ITEMS.map((item) => {
                  const href = item.path ? `${basePath}/${item.path}` : basePath;
                  const active = currentSegment === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={href}
                      title={rail ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-brand-600" : "text-gray-500"}`} />
                      <span className={rail ? "lg:sr-only" : ""}>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </SidebarSection>
          </div>

          <div className="border-t border-gray-200">
            <SidebarSection title="Build stages" hideTitle={rail}>
              <div className="space-y-0.5 px-1">
                {BUILD_STAGES.map((stage) => {
                  const stageFlow = flow?.[stage.key];
                  return (
                    <BuildStageItem
                      key={stage.key}
                      href={`${basePath}/${stage.path}`}
                      label={stage.label}
                      status={stageFlow?.status ?? "not_started"}
                      subtext={stageFlow?.subtext ?? "Not started"}
                      isActive={currentSegment === stage.path}
                      collapsed={rail}
                    />
                  );
                })}
              </div>
            </SidebarSection>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setRailChoice(!rail)}
          className="hidden items-center gap-2 border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-800 lg:flex"
          aria-label={rail ? "Expand the course sidebar" : "Collapse the course sidebar"}
          title={rail ? "Expand sidebar" : undefined}
        >
          {rail ? (
            <ChevronDoubleRightIcon className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronDoubleLeftIcon className="h-4 w-4 shrink-0" />
              Collapse
            </>
          )}
        </button>
      </aside>

      {drawerOpen && (
        <button
          type="button"
          aria-label="Close the course menu"
          className="fixed inset-0 top-12 z-10 bg-black/20 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-surface px-4 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Bars3Icon className="h-4 w-4" />
            Course menu
          </button>
          <span className="truncate text-sm text-gray-500">{course?.title}</span>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
