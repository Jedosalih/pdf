"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Link } from "@/lib/i18n/navigation";
import { searchTools } from "@/lib/tools/search";

export interface ToolsDirectoryToolItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  /** Already-rendered server-side (a bare `LucideIcon` component reference
   * can't cross the Server->Client prop boundary into this component). */
  icon: ReactNode;
}

export interface ToolsDirectoryGroup {
  category: string;
  label: string;
  tools: ToolsDirectoryToolItem[];
}

interface ToolsDirectorySearchProps {
  groups: ToolsDirectoryGroup[];
  searchPlaceholder: string;
  searchEmptyState: string;
}

/**
 * Client island: search box + the category-grouped tool grids below it.
 * Groups (not a flat alphabetized list) so each category card above can
 * link to a real `#category` anchor on this page — filtering hides empty
 * groups rather than flattening them, so those anchors stay meaningful.
 * Renders its own card markup (mirrors `ToolCard`'s look) rather than
 * reusing `ToolGrid`/`ToolCard` directly, since those type their `icon`
 * prop as a `LucideIcon` component reference for server-only use.
 */
export function ToolsDirectorySearch({
  groups,
  searchPlaceholder,
  searchEmptyState,
}: ToolsDirectorySearchProps) {
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups;
    return groups
      .map((group) => ({ ...group, tools: searchTools(group.tools, query) }))
      .filter((group) => group.tools.length > 0);
  }, [groups, query]);

  return (
    <div className="flex flex-col gap-8">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        trailing={<Search className="h-4 w-4" aria-hidden="true" />}
      />
      {filteredGroups.length === 0 ? (
        <p className="text-small text-muted-foreground">{searchEmptyState}</p>
      ) : (
        filteredGroups.map((group) => (
          <div key={group.category} id={group.category} className="flex scroll-mt-24 flex-col gap-4">
            <h2 className="text-h3 font-semibold text-foreground">{group.label}</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.tools.map((tool) => (
                <Link
                  key={tool.slug}
                  href={`/${tool.slug}`}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-background px-3.5 py-3 transition-colors hover:border-primary/30 hover:bg-surface"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    {tool.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-semibold text-foreground">{tool.title}</p>
                    <p className="truncate text-caption text-muted-foreground">{tool.description}</p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
