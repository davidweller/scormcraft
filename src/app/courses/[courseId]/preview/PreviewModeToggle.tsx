"use client";

import { useState, useEffect } from "react";

type Mode = "learner" | "lms";

export function PreviewModeToggle({
  iframeSrc,
  noContent,
  courseId,
}: {
  iframeSrc: string;
  noContent: boolean;
  courseId: string;
}) {
  const [mode, setMode] = useState<Mode>("learner");

  useEffect(() => {
    if (!noContent) {
      fetch(`/api/courses/${courseId}/preview/mark-viewed`, { method: "POST" });
    }
  }, [courseId, noContent]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setMode("learner")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "learner" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Preview (Learner View)
          </button>
          <button
            type="button"
            onClick={() => setMode("lms")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "lms" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Preview (LMS Simulation)
          </button>
        </div>
        {mode === "lms" && (
          <p className="text-sm text-gray-500">
            Content runs with SCORM API for bookmarking and completion validation.
          </p>
        )}
      </div>
      {noContent ? null : (
        <div className="flex-1 min-h-0 rounded border border-gray-200 bg-white">
          <iframe
            title={mode === "lms" ? "Course preview (LMS simulation)" : "Course preview (learner view)"}
            src={iframeSrc}
            className="h-[calc(100vh-12rem)] w-full border-0 rounded"
            sandbox="allow-scripts allow-same-origin allow-downloads"
          />
        </div>
      )}
    </div>
  );
}
