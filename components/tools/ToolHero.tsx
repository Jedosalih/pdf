import type { ReactNode } from "react";
import type { BreadcrumbItem } from "@/components/layout/Breadcrumbs";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

interface ToolHeroProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  breadcrumbs: BreadcrumbItem[];
}

export function ToolHero({ icon, title, subtitle, breadcrumbs }: ToolHeroProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-secondary text-primary">
        {icon}
      </div>
      <h1 className="text-h1 font-bold text-foreground">{title}</h1>
      <p className="max-w-xl text-body text-muted-foreground">{subtitle}</p>
    </div>
  );
}
