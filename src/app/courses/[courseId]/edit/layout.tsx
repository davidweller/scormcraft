"use client";

import { useParams } from "next/navigation";
import { CourseEditorShell } from "@/components/course-editor/CourseEditorShell";

/**
 * The editor lives in the layout, not the pages, so the outline keeps its
 * loaded course and its open and closed rows when moving between pages.
 */
export default function EditLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pageId = typeof params.pageId === "string" ? params.pageId : null;
  return (
    <>
      <CourseEditorShell selectedPageId={pageId} />
      {children}
    </>
  );
}
