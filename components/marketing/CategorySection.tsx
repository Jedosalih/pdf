import type { ReactNode } from "react";

interface CategorySectionProps {
  title: string;
  children: ReactNode;
}

/** Only rendered by the caller for categories that actually have enabled
 * tools — an empty category card grid would be a dead end. */
export function CategorySection({ title, children }: CategorySectionProps) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-h3 font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}
