"use client";

import { useRef } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Link } from "@/lib/i18n/navigation";

export interface PopularToolItem {
  slug: string;
  title: string;
  description: string;
  /** Already-rendered server-side (a bare `LucideIcon` component reference
   * can't cross the Server->Client prop boundary into this component). */
  icon: ReactNode;
}

interface PopularToolsRowProps {
  tools: PopularToolItem[];
  scrollLeftLabel: string;
  scrollRightLabel: string;
}

/**
 * Horizontal scroll row for a small, static set of cards — no carousel
 * library needed at this size; native swipe/trackpad scroll already
 * works, these arrows are just a progressive-enhancement nav aid. Renders
 * its own card markup (mirrors `ToolCard`'s look) rather than reusing
 * `ToolCard` directly, since that types `icon` as a `LucideIcon` component
 * reference for server-only use.
 */
export function PopularToolsRow({ tools, scrollLeftLabel, scrollRightLabel }: PopularToolsRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  }

  return (
    <div>
      <div
        ref={scrollerRef}
        className="flex snap-x gap-4 overflow-x-auto scroll-smooth pb-2 scrollbar-none"
      >
        {tools.map((tool) => (
          <Link
            key={tool.slug}
            href={`/${tool.slug}`}
            title={tool.description}
            className="group flex w-32 shrink-0 snap-start flex-col items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-4 text-center transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-white">
              {tool.icon}
            </div>
            <p className="text-small font-medium text-foreground">{tool.title}</p>
          </Link>
        ))}
      </div>
      <div className="mt-3 hidden justify-end gap-2 sm:flex">
        <IconButton label={scrollLeftLabel} variant="secondary" size="sm" onClick={() => scrollBy(-300)}>
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </IconButton>
        <IconButton label={scrollRightLabel} variant="secondary" size="sm" onClick={() => scrollBy(300)}>
          <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
