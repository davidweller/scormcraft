"use client";

import { useEffect, useState } from "react";
import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
} from "@heroicons/react/24/outline";

const DEVICES = [
  { key: "desktop", label: "Desktop", width: null, icon: ComputerDesktopIcon },
  { key: "tablet", label: "Tablet", width: 820, icon: DeviceTabletIcon },
  { key: "phone", label: "Phone", width: 390, icon: DevicePhoneMobileIcon },
] as const;

type DeviceKey = (typeof DEVICES)[number]["key"];

/** The course preview, at a choice of screen widths. */
export function PreviewModeToggle({
  iframeSrc,
  noContent,
  courseId,
}: {
  iframeSrc: string;
  noContent: boolean;
  courseId: string;
}) {
  const [device, setDevice] = useState<DeviceKey>("desktop");

  useEffect(() => {
    if (!noContent) {
      fetch(`/api/courses/${courseId}/preview/mark-viewed`, { method: "POST" });
    }
  }, [courseId, noContent]);

  const current = DEVICES.find((d) => d.key === device)!;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1" role="group" aria-label="Preview size">
          {DEVICES.map((d) => {
            const Icon = d.icon;
            const active = d.key === device;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDevice(d.key)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-surface text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {d.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-gray-500">
          {current.width ? `${current.width}px wide` : "Full width"}. This is what learners see in the
          exported package.
        </p>
      </div>
      {noContent ? null : (
        <div className="flex min-h-0 flex-1 justify-center rounded-lg border border-gray-200 bg-gray-100 p-3">
          <iframe
            title={`Course preview, ${current.label.toLowerCase()} size`}
            src={iframeSrc}
            style={{ width: current.width ? `${current.width}px` : "100%" }}
            className="h-[calc(100vh-14rem)] max-w-full rounded border border-gray-300 bg-white shadow-sm transition-[width] duration-200"
            sandbox="allow-scripts allow-same-origin allow-downloads"
          />
        </div>
      )}
    </div>
  );
}
