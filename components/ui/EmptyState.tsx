import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

/** Every empty state needs an explanation and a next action (blueprint
 * §50) — never a blank box. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-h3 font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-small text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
