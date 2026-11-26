"use client";

import Link from "next/link";
import type { StageStatus } from "@/lib/course-tree";

interface BuildStageItemProps {
  href: string;
  label: string;
  status: StageStatus;
  subtext: string;
  isActive?: boolean;
}

function StatusIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "complete":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      );
    case "in_progress":
      return (
        <span className="flex h-5 w-5 items-center justify-center">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </span>
      );
    case "has_issues":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
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
}: BuildStageItemProps) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-3 rounded-md px-3 py-2 transition-colors ${
        isActive
          ? "bg-brand-50 text-brand-700"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <StatusIcon status={status} />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-medium ${isActive ? "text-brand-700" : ""}`}>
          {label}
        </div>
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
