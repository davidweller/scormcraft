import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-3rem)] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-gray-900">Page not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          This page doesn&apos;t exist, or the course it belonged to has been deleted.
        </p>
        <ButtonLink href="/courses" className="mt-5">
          Go to courses
        </ButtonLink>
      </div>
    </main>
  );
}
