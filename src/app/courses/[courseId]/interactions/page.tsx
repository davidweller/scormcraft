import Link from "next/link";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/base-url";

interface Block {
  id: string;
  pageId: string;
  category: "content" | "interaction";
  type: string;
  data: {
    question?: string;
    prompt?: string;
    options?: string[];
    correctIndex?: number;
    correct?: boolean;
  };
  order: number;
}

interface Page {
  id: string;
  title: string;
  blocks: Block[];
}

interface Lesson {
  id: string;
  title: string;
  pages: Page[];
}

interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  modules: Module[];
}

interface FlattenedInteraction {
  block: Block;
  page: Page;
  lesson: Lesson;
  module: Module;
}

async function getCourse(courseId: string): Promise<Course | null> {
  const res = await fetch(`${getBaseUrl()}/api/courses/${courseId}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

function flattenInteractions(course: Course): FlattenedInteraction[] {
  const result: FlattenedInteraction[] = [];
  for (const mod of course.modules ?? []) {
    for (const lesson of mod.lessons ?? []) {
      for (const page of lesson.pages ?? []) {
        for (const block of page.blocks ?? []) {
          if (block.category === "interaction") {
            result.push({ block, page, lesson, module: mod });
          }
        }
      }
    }
  }
  return result;
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "multiple_choice":
      return "Multiple Choice";
    case "true_false":
      return "True / False";
    case "reflection":
      return "Reflection";
    case "drag_and_drop":
      return "Drag & Drop";
    case "matching":
      return "Matching";
    case "dialog_cards":
      return "Dialog Cards";
    default:
      return type;
  }
}

function getTypeBadgeClass(type: string): string {
  switch (type) {
    case "multiple_choice":
      return "bg-brand-100 text-brand-800";
    case "true_false":
      return "bg-green-100 text-green-800";
    case "reflection":
      return "bg-purple-100 text-purple-800";
    case "drag_and_drop":
      return "bg-orange-100 text-orange-800";
    case "matching":
      return "bg-teal-100 text-teal-800";
    case "dialog_cards":
      return "bg-pink-100 text-pink-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default async function InteractionsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) notFound();

  const interactions = flattenInteractions(course);

  return (
    <main className="p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Interactions</h1>
          <p className="mt-1 text-sm text-gray-500">
            All quizzes and interactions across the course ({interactions.length} total).
          </p>
        </div>

        {interactions.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-8 text-center">
            <p className="font-medium text-gray-800">No interactions yet.</p>
            <p className="mt-1 text-sm text-gray-600">
              Add quizzes and interactions when editing pages.
            </p>
            <Link
              href={`/courses/${courseId}/edit`}
              className="mt-4 inline-flex items-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              Go to editor
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Question / Prompt
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Location
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-surface">
                {interactions.map(({ block, page, lesson, module }) => {
                  const questionText = block.data.question ?? block.data.prompt ?? "—";
                  const truncated = questionText.length > 80 ? questionText.slice(0, 80) + "…" : questionText;
                  return (
                    <tr key={block.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getTypeBadgeClass(block.type)}`}
                        >
                          {getTypeLabel(block.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {truncated}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <span className="font-medium">{module.title}</span>
                        <span className="mx-1">→</span>
                        {lesson.title}
                        <span className="mx-1">→</span>
                        {page.title}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        <Link
                          href={`/courses/${courseId}/edit/page/${page.id}`}
                          className="text-brand-600 hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
