"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CourseApiResponse } from "@/lib/api";
import { getFlowCompletion } from "@/lib/course-tree";

const STEPS = [
  { key: "blueprint", label: "Blueprint", path: "blueprint" },
  { key: "generate", label: "Lessons", path: "generate" },
  { key: "interactions", label: "Interactions", path: "generate-interactions" },
  { key: "review", label: "Review", path: "review" },
  { key: "preview", label: "Preview", path: "preview" },
  { key: "export", label: "Export", path: "export" },
] as const;

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CourseFlowStepper({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const [flow, setFlow] = useState<ReturnType<typeof getFlowCompletion> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses/${courseId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((course: CourseApiResponse | null) => {
        if (cancelled || !course) return;
        setFlow(getFlowCompletion(course));
      })
      .catch(() => setFlow(null));
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const basePath = `/courses/${courseId}`;
  const currentSegment = pathname?.replace(basePath, "").replace(/^\//, "").split("/")[0] ?? "";

  const getStepStatus = (step: (typeof STEPS)[number], index: number) => {
    const isCurrentStep = currentSegment === step.path;
    const completed = flow ? flow[step.key as keyof typeof flow] : false;
    const canReach = flow
      ? (step.key === "blueprint" && true) ||
        (step.key === "generate" && flow.blueprint) ||
        (step.key === "interactions" && flow.generate) ||
        (step.key === "review" && flow.interactions) ||
        (step.key === "preview" && flow.interactions) ||
        (step.key === "export" && flow.interactions)
      : true;
    return { isCurrentStep, completed, canReach };
  };

  return (
    <nav className="flex items-center gap-1 overflow-x-auto py-2" aria-label="Course flow">
      {STEPS.map((step, index) => {
        const href = `${basePath}/${step.path}`;
        const { isCurrentStep, completed, canReach } = getStepStatus(step, index);
        const disabled = !canReach && !completed && !isCurrentStep;

        const content = (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
              {completed && !isCurrentStep ? (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <CheckIcon />
                </span>
              ) : (
                <span
                  className={
                    isCurrentStep
                      ? "bg-brand-600 text-white"
                      : disabled
                        ? "bg-gray-100 text-gray-400"
                        : "bg-gray-200 text-gray-700"
                  }
                >
                  {index + 1}
                </span>
              )}
            </span>
            <span className={isCurrentStep ? "font-medium text-brand-600" : disabled ? "text-gray-400" : "text-gray-700"}>
              {step.label}
            </span>
          </>
        );

        return (
          <span key={step.key} className="flex items-center gap-2 shrink-0">
            {index > 0 && <span className="h-px w-4 bg-gray-200 shrink-0" aria-hidden />}
            {disabled ? (
              <span className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5">
                {content}
              </span>
            ) : (
              <Link
                href={href}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-100 ${
                  isCurrentStep ? "bg-brand-50" : ""
                }`}
              >
                {content}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
