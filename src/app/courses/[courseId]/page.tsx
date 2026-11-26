import { ButtonLink, EmptyState } from "@/components/ui";
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
    <main className="min-h-[calc(100vh-3rem)] p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
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
          <EmptyState
            title="This course is empty"
            description="Have the AI draft an outline for you to approve, or add modules, lessons and pages yourself."
            action={
              <>
                <ButtonLink href={`/courses/${courseId}/build`}>Build with AI</ButtonLink>
                <ButtonLink href={`/courses/${courseId}/edit`} variant="secondary">
                  Open the editor
                </ButtonLink>
              </>
            }
          />
        )}
      </div>
    </main>
  );
}
