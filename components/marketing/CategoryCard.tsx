import type { LucideIcon } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

interface CategoryCardProps {
  href: string;
  icon: LucideIcon;
  label: string;
  count: string;
}

export function CategoryCard({ href, icon: Icon, label, count }: CategoryCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-surface"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-body font-semibold text-foreground">{label}</p>
        <p className="text-small text-muted-foreground">{count}</p>
      </div>
    </Link>
  );
}
