"use client";

import Link from "next/link";
import type { CourseApiResponse } from "@/lib/api";
import { getCourseCounts, getCourseCompletion } from "@/lib/course-tree";

export function CoursePrimaryCTA({ courseId, course }: { courseId: string; course: CourseApiResponse }) {
  const { totalModules, totalLessons, totalPages } = getCourseCounts(course);
  const completion = getCourseCompletion(course);
  const hasStructure = totalModules > 0 && totalLessons > 0;
  const hasContent = totalPages > 0 && completion > 0;

  if (!hasStructure) {
    return (
      <Link
        href={`/courses/${courseId}/blueprint`}
        className="inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        Complete Blueprint
      </Link>
    );
  }
  if (!hasContent) {
    return (
      <Link
        href={`/courses/${courseId}/generate`}
        className="inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        Generate Module Content
      </Link>
    );
  }
  return (
    <Link
      href={`/courses/${courseId}/export`}
      className="inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
    >
      Export SCORM 1.2
    </Link>
  );
}
