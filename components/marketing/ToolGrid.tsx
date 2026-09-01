import type { ReactNode } from "react";
import { ToolCard } from "./ToolCard";

export interface ToolGridItem {
  slug: string;
  icon: ReactNode;
  title: string;
  description: string;
}

export function ToolGrid({ tools }: { tools: ToolGridItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard
          key={tool.slug}
          href={`/${tool.slug}`}
          icon={tool.icon}
          title={tool.title}
          description={tool.description}
        />
      ))}
    </div>
  );
}
