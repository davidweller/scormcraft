"use client";

import { useEffect, useState } from "react";
import { ComputerDesktopIcon, MoonIcon, SunIcon } from "@heroicons/react/24/outline";

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "scormcraft-theme";

/**
 * Runs before the page paints, so a dark-theme user never sees a white flash.
 * Kept as a string because it is inlined into the document head.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

/** Cycles System, Light, Dark. The choice is kept in this browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored && ORDER.includes(stored)) setTheme(stored);
  }, []);

  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function next() {
    const value = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(value);
    localStorage.setItem(THEME_STORAGE_KEY, value);
  }

  const Icon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : ComputerDesktopIcon;
  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${LABEL[theme]}. Click to change.`}
      aria-label={`Theme: ${LABEL[theme]}. Click to change.`}
      className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
