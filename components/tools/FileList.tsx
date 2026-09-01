"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { cn } from "@/lib/utils/cn";

export interface FileListItem {
  id: string;
  name: string;
  status: "uploading" | "uploaded" | "error";
  /** Pre-resolved, localized: the file size, "Uploading…", or the specific error. */
  statusLabel: string;
}

interface FileListProps {
  items: FileListItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  removeLabel: string;
  moveUpLabel: string;
  moveDownLabel: string;
  disabled?: boolean;
}

export function FileList({
  items,
  onReorder,
  onRemove,
  removeLabel,
  moveUpLabel,
  moveDownLabel,
  disabled,
}: FileListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable={!disabled}
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event: DragEvent<HTMLLIElement>) => event.preventDefault()}
          onDrop={(event: DragEvent<HTMLLIElement>) => {
            event.preventDefault();
            if (dragIndex !== null && dragIndex !== index) {
              onReorder(dragIndex, index);
            }
            setDragIndex(null);
          }}
          className={cn(
            "flex items-center gap-3 rounded-md border border-border bg-background p-3",
            item.status === "error" && "border-error/40 bg-error/5",
          )}
        >
          <span aria-hidden="true" className="text-muted-foreground">
            {index + 1}.
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-small font-medium text-foreground">
              {item.name}
            </p>
            <p className="text-caption text-muted-foreground">
              {item.statusLabel}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => onReorder(index, index - 1)}
              aria-label={moveUpLabel}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface disabled:pointer-events-none disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={disabled || index === items.length - 1}
              onClick={() => onReorder(index, index + 1)}
              aria-label={moveDownLabel}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-surface disabled:pointer-events-none disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(item.id)}
              aria-label={removeLabel}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-error/10 hover:text-error disabled:pointer-events-none disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
