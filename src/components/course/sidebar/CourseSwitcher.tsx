"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Transition } from "@headlessui/react";
import { ChevronUpDownIcon, PlusIcon } from "@heroicons/react/20/solid";

interface CourseBasic {
  id: string;
  title: string;
}

interface CourseSwitcherProps {
  currentCourseId: string;
  currentCourseTitle: string;
}

export function CourseSwitcher({ currentCourseId, currentCourseTitle }: CourseSwitcherProps) {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseBasic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/courses")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CourseBasic[]) => {
        setCourses(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const otherCourses = courses.filter((c) => c.id !== currentCourseId);

  return (
    <div className="px-3 py-3">
      <Menu as="div" className="relative">
        <Menu.Button className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-surface px-3 py-2 text-left shadow-sm transition-colors hover:bg-gray-50">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-gray-900">
              {currentCourseTitle || "Untitled Course"}
            </div>
            <div className="text-xs text-gray-500">Current course</div>
          </div>
          <ChevronUpDownIcon className="ml-2 h-5 w-5 shrink-0 text-gray-400" />
        </Menu.Button>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-surface py-1 shadow-lg focus:outline-none">
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500">Loading...</div>
            ) : otherCourses.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No other courses</div>
            ) : (
              otherCourses.map((course) => (
                <Menu.Item key={course.id}>
                  {({ active }) => (
                    <button
                      type="button"
                      onClick={() => router.push(`/courses/${course.id}`)}
                      className={`w-full px-3 py-2 text-left text-sm ${
                        active ? "bg-gray-100" : ""
                      }`}
                    >
                      <span className="block truncate font-medium text-gray-900">
                        {course.title || "Untitled Course"}
                      </span>
                    </button>
                  )}
                </Menu.Item>
              ))
            )}
            <div className="border-t border-gray-100 pt-1">
              <Menu.Item>
                {({ active }) => (
                  <Link
                    href="/courses/new"
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
                      active ? "bg-gray-100" : ""
                    }`}
                  >
                    <PlusIcon className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-700">New course</span>
                  </Link>
                )}
              </Menu.Item>
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
    </div>
  );
}
