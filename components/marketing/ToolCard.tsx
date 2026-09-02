import type { LucideIcon } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

interface ToolCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ToolCard({ href, icon: Icon, title, description }: ToolCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-background p-5 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-md bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-white">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-body font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-small text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
