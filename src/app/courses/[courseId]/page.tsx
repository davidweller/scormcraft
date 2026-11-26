import Link from "next/link";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/base-url";
import type { CourseApiResponse } from "@/lib/api";
import { getCourseCounts, getEstimatedSeatTimeMinutes } from "@/lib/course-tree";
import { CourseMetadata } from "@/components/course/CourseMetadata";
import { NextActionPanel } from "@/components/course/NextActionPanel";
import { ModuleList } from "@/components/course/ModuleList";

async function getCourse(courseId: string): Promise<CourseApiResponse | null> {
  const res = await fetch(`${getBaseUrl()}/api/courses/${courseId}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) notFound();

  const counts = getCourseCounts(course);
  const seatTimeMin = getEstimatedSeatTimeMinutes(course);

  return (
    <main className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/courses" className="text-brand-600 hover:underline">
            ← Courses
          </Link>
        </div>

        <NextActionPanel course={course} />

        <div className="rounded-lg border border-gray-200 bg-surface p-6 shadow-sm">
          <CourseMetadata courseId={courseId} course={course} />
          <div className="mt-3 text-sm text-gray-500">
            {counts.totalModules} modules · {counts.totalPages} pages · {counts.totalInteractions} interactions
            {seatTimeMin != null ? ` · ~${seatTimeMin} min seat time` : ""}
          </div>
        </div>
        {course.overview && (
          <p className="text-gray-600">{course.overview}</p>
        )}
        {course.modules?.length > 0 ? (
          <div id="modules" className="pt-2 scroll-mt-6">
            <ModuleList courseId={courseId} course={course} />
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-8 text-center shadow-sm">
            <p className="font-medium text-gray-800">No lessons yet.</p>
            <p className="mt-1 text-sm text-gray-600">
              Generate from ILOs or add manually via the Blueprint.
            </p>
            <Link
              href={`/courses/${courseId}/blueprint`}
              className="mt-4 inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              Complete Blueprint
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
