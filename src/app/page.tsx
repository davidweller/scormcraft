"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  FolderOpenIcon,
  SparklesIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

type CourseItem = {
  id: string;
  title: string;
  overview: string | null;
  updatedAt: string;
};

function formatUpdatedDate(updatedAt: string) {
  try {
    return new Date(updatedAt).toLocaleDateString();
  } catch {
    return "recently";
  }
}

export default function Home() {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load courses");
        }
        return res.json();
      })
      .then((data: CourseItem[]) => {
        if (!cancelled) {
          setCourses(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
          setCourses([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const recentCourses = useMemo(() => courses.slice(0, 5), [courses]);
  const hasCourses = recentCourses.length > 0;

  return (
    <main className="min-h-screen bg-gray-50/40">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                SCORM Course Builder
              </p>
              <h1 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
                Create SCORM-ready training content faster
              </h1>
              <p className="mt-3 text-sm text-gray-600 sm:text-base">
                Start a new course, continue recent work, or jump into your full course library.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/courses/new"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <SparklesIcon className="h-4 w-4" />
                Create new course
              </Link>
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                <FolderOpenIcon className="h-4 w-4" />
                View all courses
              </Link>
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                <Cog6ToothIcon className="h-4 w-4" />
                Settings
              </Link>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-blue-100 bg-white/80 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <SparklesIcon className="h-4 w-4 text-blue-600" />
                Create
              </p>
              <p className="mt-1 text-sm text-gray-600">Start from a blank course setup in minutes.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white/80 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <ClockIcon className="h-4 w-4 text-blue-600" />
                Continue
              </p>
              <p className="mt-1 text-sm text-gray-600">Pick up where you left off with recent courses.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white/80 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <DocumentArrowDownIcon className="h-4 w-4 text-blue-600" />
                Import
              </p>
              <p className="mt-1 text-sm text-gray-600">Import from Word from the new course page.</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <BookOpenIcon className="h-5 w-5 text-gray-500" />
                Recent courses
              </h2>
              <p className="mt-1 text-sm text-gray-500">Continue editing your latest course work.</p>
            </div>
            {hasCourses && (
              <Link
                href="/courses"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                See all
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-500">Loading recent courses…</p>
          ) : loadError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                We could not load your recent courses right now.
              </p>
              <div className="mt-3">
                <Link
                  href="/courses"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
                >
                  Go to courses
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : !hasCourses ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-8 text-center">
              <h3 className="text-base font-semibold text-gray-900">No courses yet</h3>
              <p className="mt-2 text-sm text-gray-600">
                Create your first course or import a Word document to get started.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Link
                  href="/courses/new"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <SparklesIcon className="h-4 w-4" />
                  Create course
                </Link>
                <Link
                  href="/courses"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <FolderOpenIcon className="h-4 w-4" />
                  View courses
                </Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentCourses.map((course) => (
                <li key={course.id}>
                  <Link
                    href={`/courses/${course.id}`}
                    className="block rounded-lg border border-gray-200 p-4 transition-colors hover:border-blue-300 hover:bg-gray-50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-medium text-gray-900">{course.title}</p>
                        {course.overview ? (
                          <p className="mt-1 line-clamp-2 text-sm text-gray-600">{course.overview}</p>
                        ) : (
                          <p className="mt-1 text-sm text-gray-500">No overview yet.</p>
                        )}
                        <p className="mt-2 text-xs text-gray-400">
                          Updated {formatUpdatedDate(course.updatedAt)}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                        Continue
                        <ArrowRightIcon className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <SparklesIcon className="h-5 w-5 text-blue-600" />
            Quick start
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-gray-600">
            <li>1. Create a new course with title, audience, and goals.</li>
            <li>2. Build your blueprint, then generate pages and interactions.</li>
            <li>3. Preview and export your package to SCORM 1.2.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
