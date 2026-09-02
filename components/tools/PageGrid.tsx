"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { Check, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "@/components/ui/IconButton";

export interface PageGridItem {
  /** Stable key across reorders/toggles — the page's original page number. */
  key: number;
  /** Page number to display — changes with position in reorder mode. */
  pageNumber: number;
  dataUrl: string;
  selected?: boolean;
}

interface PageGridProps {
  items: PageGridItem[];
  mode: "select" | "reorder";
  onToggle?: (key: number) => void;
  onMove?: (fromIndex: number, toIndex: number) => void;
  toggleLabel?: (pageNumber: number) => string;
  moveUpLabel?: (pageNumber: number) => string;
  moveDownLabel?: (pageNumber: number) => string;
}

/**
 * Shared visual page grid for Delete/Extract Pages (click to toggle) and
 * Reorder Pages (drag, or move-up/down for keyboard/touch users — same
 * accessible-fallback pattern as FileList's file reordering).
 */
export function PageGrid({
  items,
  mode,
  onToggle,
  onMove,
  toggleLabel,
  moveUpLabel,
  moveDownLabel,
}: PageGridProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const selectable = mode === "select";
  const reorderable = mode === "reorder";

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {items.map((item, index) => (
        <div
          key={item.key}
          draggable={reorderable}
          onDragStart={() => reorderable && setDragIndex(index)}
          onDragOver={(event: DragEvent<HTMLDivElement>) => reorderable && event.preventDefault()}
          onDrop={(event: DragEvent<HTMLDivElement>) => {
            if (!reorderable) return;
            event.preventDefault();
            if (dragIndex !== null && dragIndex !== index) {
              onMove?.(dragIndex, index);
            }
            setDragIndex(null);
          }}
          className={cn(
            "group relative overflow-hidden rounded-md border bg-background transition-colors",
            reorderable && "cursor-grab active:cursor-grabbing",
            item.selected ? "border-primary ring-2 ring-primary/30" : "border-border",
          )}
        >
          {selectable ? (
            <button
              type="button"
              onClick={() => onToggle?.(item.key)}
              aria-pressed={item.selected}
              aria-label={toggleLabel?.(item.pageNumber)}
              className="block w-full cursor-pointer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- client-rendered canvas data URL, not an optimizable static asset */}
              <img src={item.dataUrl} alt="" className="w-full" />
            </button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- see above
            <img src={item.dataUrl} alt="" className="w-full" />
          )}

          <span className="absolute bottom-1 start-1 rounded-sm bg-foreground/80 px-1.5 py-0.5 text-caption font-medium text-background">
            {item.pageNumber}
          </span>

          {selectable && item.selected ? (
            <span className="absolute top-1 end-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
              <Check className="h-3 w-3" aria-hidden="true" />
            </span>
          ) : null}

          {reorderable ? (
            <div className="absolute inset-x-0 top-0 flex justify-end gap-0.5 bg-gradient-to-b from-foreground/50 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <IconButton
                size="sm"
                label={moveUpLabel?.(item.pageNumber) ?? "Move earlier"}
                disabled={index === 0}
                onClick={() => onMove?.(index, index - 1)}
                className="h-6 w-6 bg-background/90"
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
              <IconButton
                size="sm"
                label={moveDownLabel?.(item.pageNumber) ?? "Move later"}
                disabled={index === items.length - 1}
                onClick={() => onMove?.(index, index + 1)}
                className="h-6 w-6 bg-background/90"
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
