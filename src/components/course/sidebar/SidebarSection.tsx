interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
  /** Keeps the title for screen readers but hides it, for the narrow rail. */
  hideTitle?: boolean;
}

export function SidebarSection({ title, children, hideTitle = false }: SidebarSectionProps) {
  return (
    <div className="py-2">
      <div
        className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 ${
          hideTitle ? "lg:sr-only" : ""
        }`}
      >
        {title}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
