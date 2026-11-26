"use client";

import Link from "next/link";
import { CheckIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import type { StageStatus } from "@/lib/course-tree";

interface BuildStageItemProps {
  href: string;
  label: string;
  status: StageStatus;
  subtext: string;
  isActive?: boolean;
  /** Icon only, for the narrow rail. The label stays available to screen readers. */
  collapsed?: boolean;
}

function StatusIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "complete":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
      );
    case "in_progress":
      // A half-filled ring. Not a spinner: nothing is running.
      return (
        <span className="flex h-5 w-5 items-center justify-center">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-brand-600 bg-[linear-gradient(90deg,rgb(var(--brand-600))_50%,transparent_50%)]" />
        </span>
      );
    case "has_issues":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
        </span>
      );
    case "not_started":
    default:
      return (
        <span className="flex h-5 w-5 items-center justify-center">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300" />
        </span>
      );
  }
}

export function BuildStageItem({
  href,
  label,
  status,
  subtext,
  isActive = false,
  collapsed = false,
}: BuildStageItemProps) {
  return (
    <Link
      href={href}
      title={collapsed ? `${label}: ${subtext}` : undefined}
      aria-current={isActive ? "page" : undefined}
      className={`group flex items-start gap-3 rounded-md px-3 py-2 transition-colors ${
        isActive
          ? "bg-brand-50 text-brand-700"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <span className="shrink-0">
        <StatusIcon status={status} />
      </span>
      <div className={`min-w-0 flex-1 ${collapsed ? "lg:sr-only" : ""}`}>
        <div className={`text-sm font-medium ${isActive ? "text-brand-700" : ""}`}>{label}</div>
        <div
          className={`truncate text-xs ${
            status === "has_issues"
              ? "text-amber-600"
              : isActive
                ? "text-brand-600"
                : "text-gray-500"
          }`}
        >
          {subtext}
        </div>
      </div>
    </Link>
  );
}
