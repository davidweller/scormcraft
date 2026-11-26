"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, ExclamationTriangleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import type { CourseIssue } from "@/lib/course-tree";

interface ReviewChecklistProps {
  issues: CourseIssue[];
  isOpen: boolean;
  onClose: () => void;
}

function IssueIcon({ severity }: { severity: "error" | "warning" }) {
  if (severity === "error") {
    return <ExclamationCircleIcon className="h-5 w-5 text-red-500" />;
  }
  return <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />;
}

function groupIssuesByType(issues: CourseIssue[]) {
  const groups: Record<string, CourseIssue[]> = {};
  for (const issue of issues) {
    if (!groups[issue.type]) {
      groups[issue.type] = [];
    }
    groups[issue.type].push(issue);
  }
  return groups;
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "empty_page":
      return "Empty Pages";
    case "missing_quiz_answer":
      return "Missing Quiz Answers";
    case "missing_content":
      return "Missing Content";
    case "no_interactions":
      return "No Interactions";
    default:
      return type;
  }
}

export function ReviewChecklist({ issues, isOpen, onClose }: ReviewChecklistProps) {
  const grouped = groupIssuesByType(issues);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-start justify-end p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-x-4"
              enterTo="opacity-100 translate-x-0"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-x-0"
              leaveTo="opacity-0 translate-x-4"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-surface shadow-xl transition-all">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <Dialog.Title className="text-lg font-semibold text-gray-900">
                    Review Checklist
                  </Dialog.Title>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="px-4 py-3">
                  <div className="flex items-center gap-4 text-sm">
                    {errorCount > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <ExclamationCircleIcon className="h-4 w-4" />
                        {errorCount} {errorCount === 1 ? "error" : "errors"}
                      </span>
                    )}
                    {warningCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        {warningCount} {warningCount === 1 ? "warning" : "warnings"}
                      </span>
                    )}
                    {issues.length === 0 && (
                      <span className="text-green-600">All checks passed!</span>
                    )}
                  </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto border-t border-gray-100">
                  {Object.entries(grouped).map(([type, typeIssues]) => (
                    <div key={type} className="border-b border-gray-100 last:border-b-0">
                      <div className="bg-gray-50 px-4 py-2">
                        <h3 className="text-sm font-medium text-gray-700">
                          {getTypeLabel(type)} ({typeIssues.length})
                        </h3>
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {typeIssues.map((issue, idx) => (
                          <li key={idx} className="px-4 py-3">
                            <div className="flex items-start gap-3">
                              <IssueIcon severity={issue.severity} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-700">{issue.message}</p>
                                {issue.path && (
                                  <Link
                                    href={issue.path}
                                    onClick={onClose}
                                    className="mt-1 inline-flex text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
                                  >
                                    Go to fix →
                                  </Link>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export function ReviewChecklistButton({
  issues,
  children,
}: {
  issues: CourseIssue[];
  children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const errorCount = issues.filter((i) => i.severity === "error").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        {children ?? (
          <>
            {errorCount > 0 ? (
              <ExclamationCircleIcon className="h-4 w-4 text-red-500" />
            ) : (
              <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
            )}
            View {issues.length} {issues.length === 1 ? "issue" : "issues"}
          </>
        )}
      </button>
      <ReviewChecklist issues={issues} isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
