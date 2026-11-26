"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CourseApiResponse } from "@/lib/api";
import { getFlowCompletionV2 } from "@/lib/course-tree";
import {
  SidebarSection,
  BuildStageItem,
  CourseSwitcher,
  HelpSection,
} from "./sidebar";
import {
  Squares2X2Icon,
  CubeIcon,
  SparklesIcon,
  PaintBrushIcon,
  Cog6ToothIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

const BUILD_STAGES = [
  { key: "blueprint", label: "Blueprint", path: "blueprint" },
  { key: "generate", label: "Create Lessons", path: "generate" },
  { key: "interactions", label: "Create Interactions", path: "generate-interactions" },
  { key: "review", label: "Review", path: "review" },
  { key: "preview", label: "Preview", path: "preview" },
  { key: "export", label: "Export", path: "export" },
] as const;

const EDITOR_ITEMS = [
  { path: "", label: "Overview", icon: Squares2X2Icon, exact: true },
  { path: "#modules", label: "Modules", icon: CubeIcon, isAnchor: true },
  { path: "interactions", label: "Interactions", icon: SparklesIcon },
  { path: "branding", label: "Branding", icon: PaintBrushIcon },
  { path: "settings", label: "Settings", icon: Cog6ToothIcon },
  { path: "export", label: "Export", icon: ArrowDownTrayIcon },
];

export function CourseSidebar({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [course, setCourse] = useState<CourseApiResponse | null>(null);

  useEffect(() => {
    fetch(`/api/courses/${courseId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CourseApiResponse | null) => setCourse(data))
      .catch(() => setCourse(null));
  }, [courseId]);

  const basePath = `/courses/${courseId}`;
  const currentSegment = pathname?.replace(basePath, "").replace(/^\//, "").split("/")[0] ?? "";

  const isEditorActive = (path: string, exact?: boolean, isAnchor?: boolean) => {
    if (exact) return pathname === basePath || pathname === `${basePath}/`;
    if (isAnchor) return pathname === basePath || pathname === `${basePath}/`;
    return currentSegment === path;
  };

  const isStageActive = (path: string) => currentSegment === path;

  const flow = course ? getFlowCompletionV2(course) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed left-4 top-4 z-20 rounded border border-gray-200 bg-surface px-3 py-2 text-sm shadow lg:hidden"
        aria-label="Toggle sidebar"
      >
        {open ? "Close" : "Menu"}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-10 flex w-64 flex-col border-r border-gray-200 bg-surface shadow-sm transition-transform lg:static lg:z-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <CourseSwitcher
          currentCourseId={courseId}
          currentCourseTitle={course?.title ?? ""}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="border-t border-gray-200">
            <SidebarSection title="Build Stages" collapsible defaultOpen>
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
                      isActive={isStageActive(stage.path)}
                    />
                  );
                })}
              </div>
            </SidebarSection>
          </div>

          <div className="border-t border-gray-200">
            <SidebarSection title="Editor">
              <nav className="space-y-0.5 px-1" aria-label="Course sections">
                {EDITOR_ITEMS.map((item) => {
                  const isAnchor = "isAnchor" in item && item.isAnchor;
                  const href = isAnchor
                    ? `${basePath}/${item.path}`
                    : item.path
                      ? `${basePath}/${item.path}`
                      : basePath;
                  const active = isEditorActive(item.path, item.exact, isAnchor);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-brand-600" : "text-gray-500"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </SidebarSection>
          </div>

          <div className="border-t border-gray-200">
            <SidebarSection title="Help">
              <HelpSection />
            </SidebarSection>
          </div>
        </div>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close overlay"
          className="fixed inset-0 z-[9] bg-black/20 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
