"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui";

/** Shown when a page throws while rendering. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-600">
          This page hit an error. Your course is saved. Try again, or go back to your courses.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/courses" variant="secondary">
            Go to courses
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
