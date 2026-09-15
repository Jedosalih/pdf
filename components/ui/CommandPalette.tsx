"use client";

import { useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  /** Already-rendered (e.g. `<Icon className="h-4 w-4" />`), not a bare
   * component reference — this crosses the Server->Client boundary from
   * `GlobalCommandPalette`, and React can only serialize rendered elements
   * there, not function/component references. */
  icon?: ReactNode;
  onSelect: () => void;
}

export interface CommandPaletteGroup {
  heading: string;
  items: CommandPaletteItem[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  emptyMessage: string;
  groups: CommandPaletteGroup[];
}

/**
 * Generic searchable listbox built on the same Radix Dialog primitive
 * `Modal.tsx` uses, but with its own layout (search-first, no title/
 * description chrome) — the `groups` shape is intentionally generic so a
 * future "Recent documents" group can be added without redesigning this
 * component. Full keyboard navigation: ArrowUp/ArrowDown to move,
 * Enter to select, Escape to close (Radix Dialog's built-in behavior).
 */
export function CommandPalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  placeholder,
  emptyMessage,
  groups,
}: CommandPaletteProps) {
  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Reset the highlight whenever the query or open state changes — adjusted
  // during render (React's recommended pattern for this) rather than in an
  // effect, since this is really derived state, not a sync with an external
  // system.
  const resetKey = `${open}:${query}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setHighlightedIndex(0);
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, flatItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[highlightedIndex];
      if (item) {
        onOpenChange(false);
        item.onSelect();
      }
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-overlay",
            "data-[state=open]:animate-[overlay-in_150ms_ease-out]",
          )}
        />
        <DialogPrimitive.Content
          onKeyDown={handleKeyDown}
          className={cn(
            "fixed left-1/2 top-24 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2",
            "rounded-lg border border-border bg-background shadow-md",
            "data-[state=open]:animate-[content-in_150ms_ease-out]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{placeholder}</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={placeholder}
              className="h-12 w-full bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {flatItems.length === 0 ? (
              <p className="px-2 py-6 text-center text-small text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              groups.map((group) =>
                group.items.length > 0 ? (
                  <div key={group.heading} className="mb-2 last:mb-0">
                    <p className="px-2.5 py-1 text-caption font-medium uppercase tracking-wide text-muted-foreground">
                      {group.heading}
                    </p>
                    {group.items.map((item) => {
                      const index = flatItems.indexOf(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => {
                            onOpenChange(false);
                            item.onSelect();
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-start text-small transition-colors",
                            index === highlightedIndex && "bg-surface",
                          )}
                        >
                          {item.icon}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">
                              {item.label}
                            </span>
                            {item.description ? (
                              <span className="block truncate text-caption text-muted-foreground">
                                {item.description}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null,
              )
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
