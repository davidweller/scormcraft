"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui";

/**
 * Warns before the author leaves a page with unsaved edits.
 *
 * Closing or reloading the tab gets the browser's own prompt. Following a
 * link inside the app gets the app's dialog. Next's router has no hook for
 * blocking navigation, so link clicks are caught before the router sees them.
 */
export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter();
  const confirm = useConfirm();

  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: "Leave without saving?",
        message: "You have changes on this page that haven't been saved. Leaving now loses them.",
        confirmLabel: "Leave",
        cancelLabel: "Stay",
        danger: true,
      }).then((ok) => {
        if (ok) router.push(url.pathname + url.search + url.hash);
      });
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase, so this runs before Next's own link handler.
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirm, router]);
}
