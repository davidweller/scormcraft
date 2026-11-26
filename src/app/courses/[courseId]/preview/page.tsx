import Link from "next/link";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/base-url";
import { PreviewModeToggle } from "./PreviewModeToggle";

async function getCourse(courseId: string) {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/courses/${courseId}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

function countPages(course: {
  modules?: Array<{ lessons?: Array<{ pages?: unknown[] }> }>;
}): number {
  if (!course.modules) return 0;
  return course.modules.reduce(
    (sum, m) => sum + (m.lessons ?? []).reduce((s, l) => s + (l.pages ?? []).length, 0),
    0
  );
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) notFound();

  const totalPages = countPages(course);
  const baseUrl = getBaseUrl();
  const iframeSrc = `${baseUrl}/api/courses/${courseId}/preview/page/0`;
  const noContent = totalPages === 0;

  return (
    <main className="min-h-screen flex flex-col p-6 lg:p-8">
      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <Link href={`/courses/${courseId}`} className="text-brand-600 hover:underline">
          ← Back to course
        </Link>
        <h1 className="text-xl font-semibold">Preview: {course.title}</h1>
      </div>
      {noContent ? (
        <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
          <p className="font-medium">No pages to preview yet.</p>
          <p className="mt-1 text-sm">
            Add or generate lesson content, then return here to preview the course.
          </p>
          <Link
            href={`/courses/${courseId}/edit`}
            className="mt-4 inline-block rounded bg-amber-600 px-4 py-2 text-white hover:bg-amber-700"
          >
            Edit course
          </Link>
        </div>
      ) : (
        <PreviewModeToggle iframeSrc={iframeSrc} noContent={noContent} courseId={courseId} />
      )}
    </main>
  );
}
