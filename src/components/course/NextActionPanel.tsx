"use client";

import Link from "next/link";
import type { CourseApiResponse } from "@/lib/api";
import { getNextRecommendedAction, getFlowCompletionV2 } from "@/lib/course-tree";
import { ArrowRightIcon, EyeIcon, ArrowDownTrayIcon } from "@heroicons/react/20/solid";

interface NextActionPanelProps {
  course: CourseApiResponse;
}

export function NextActionPanel({ course }: NextActionPanelProps) {
  const nextAction = getNextRecommendedAction(course);
  const flow = getFlowCompletionV2(course);

  const showPreview = nextAction.stage !== "preview" && flow.generate.isComplete;
  const showExport = nextAction.stage !== "export" && flow.generate.isComplete;

  return (
    <div className="rounded-lg border border-gray-200 bg-gradient-to-r from-brand-50 to-brand-50 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-brand-600">
              Next step
            </span>
            {nextAction.issueCount && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {nextAction.issueCount} {nextAction.issueCount === 1 ? "issue" : "issues"}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">{nextAction.label}</h3>
          <p className="mt-0.5 text-sm text-gray-600">{nextAction.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={nextAction.href}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            {nextAction.label}
            <ArrowRightIcon className="h-4 w-4" />
          </Link>

          {showPreview && (
            <Link
              href={`/courses/${course.id}/preview`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <EyeIcon className="h-4 w-4" />
              Preview
            </Link>
          )}

          {showExport && (
            <Link
              href={`/courses/${course.id}/export`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
