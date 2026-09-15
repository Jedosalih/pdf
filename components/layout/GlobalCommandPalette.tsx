"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { searchTools } from "@/lib/tools/search";
import { useCommandPalette } from "./CommandPaletteProvider";

export interface CommandPaletteToolItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  /** Already-rendered server-side (a bare `LucideIcon` component reference
   * can't cross the Server->Client prop boundary into this component). */
  icon: ReactNode;
}

/**
 * Renders the global Ctrl/Cmd+K palette. Receives already-translated tool
 * items resolved server-side (in `app/[locale]/layout.tsx`, an async
 * Server Component) since iterating 16 different tool translation
 * namespaces isn't a good fit for `useTranslations`' single-namespace API.
 */
export function GlobalCommandPalette({ toolItems }: { toolItems: CommandPaletteToolItem[] }) {
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState("");
  const t = useTranslations("common");
  const router = useRouter();

  const results = useMemo(() => searchTools(toolItems, query), [toolItems, query]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      query={query}
      onQueryChange={setQuery}
      placeholder={t("commandPalette.placeholder")}
      emptyMessage={t("commandPalette.emptyState")}
      groups={[
        {
          heading: t("commandPalette.toolsGroup"),
          items: results.map((tool) => ({
            id: tool.slug,
            label: tool.title,
            description: tool.description,
            icon: tool.icon,
            onSelect: () => router.push(`/${tool.slug}`),
          })),
        },
      ]}
    />
  );
}
