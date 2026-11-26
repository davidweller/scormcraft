export function Card({
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-surface ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** What to show when a list or page has nothing in it yet. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** One primary action. Add a second only if it's a real alternative. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center ${className}`}
    >
      {icon && <div className="mb-3 text-gray-400 [&>svg]:h-10 [&>svg]:w-10">{icon}</div>}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** An inline message for a failed load or save. */
export function ErrorNote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={`rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 ${className}`}>
      {children}
    </p>
  );
}
