"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AcademicCapIcon } from "@heroicons/react/24/solid";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/courses", label: "Courses", match: (p: string) => p.startsWith("/courses") },
  { href: "/media", label: "Media", match: (p: string) => p.startsWith("/media") },
  { href: "/settings", label: "Settings", match: (p: string) => p === "/settings" },
];

/** The bar across the top of every screen. Its height is 3rem (h-12). */
export function AppTopBar() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-6 border-b border-gray-200 bg-surface px-4">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <AcademicCapIcon className="h-5 w-5 text-brand-600" />
        SCORMcraft
      </Link>
      <nav className="flex items-center gap-1" aria-label="Main">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
