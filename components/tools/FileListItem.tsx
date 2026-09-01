import type { DragEvent } from "react";
import { cn } from "@/lib/utils/cn";
import { FileThumbnail } from "./FileThumbnail";
import { FileActions } from "./FileActions";

export interface FileListItemData {
  id: string;
  name: string;
  mimeType: string;
  status: "uploading" | "uploaded" | "error";
  statusLabel: string;
}

interface FileListItemProps {
  item: FileListItemData;
  index: number;
  reorderable: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (toIndex: number) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  disabled?: boolean;
  labels: { moveUp: string; moveDown: string; remove: string };
}

export function FileListItem({
  item,
  index,
  reorderable,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onDragStart,
  onDrop,
  disabled,
  labels,
}: FileListItemProps) {
  return (
    <li
      draggable={reorderable && !disabled}
      onDragStart={onDragStart}
      onDragOver={(event: DragEvent<HTMLLIElement>) => event.preventDefault()}
      onDrop={(event: DragEvent<HTMLLIElement>) => {
        event.preventDefault();
        onDrop();
      }}
      className={cn(
        "flex items-center gap-3 rounded-md border border-border bg-background p-2.5",
        reorderable && !disabled && "cursor-grab active:cursor-grabbing",
        item.status === "error" && "border-error/40 bg-error/5",
      )}
    >
      <FileThumbnail mimeType={item.mimeType} status={item.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-foreground">{item.name}</p>
        <p
          className={cn(
            "text-caption",
            item.status === "error" ? "text-error" : "text-muted-foreground",
          )}
        >
          {item.statusLabel}
        </p>
      </div>
      <FileActions
        onMoveUp={reorderable && !isFirst ? () => onMove(index - 1) : undefined}
        onMoveDown={reorderable && !isLast ? () => onMove(index + 1) : undefined}
        onRemove={onRemove}
        moveUpLabel={labels.moveUp}
        moveDownLabel={labels.moveDown}
        removeLabel={labels.remove}
        disabled={disabled}
      />
    </li>
  );
}
