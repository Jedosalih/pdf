"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileListItem, type FileListItemData } from "./FileListItem";

export type FileListItem = FileListItemData;

interface FileListProps {
  items: FileListItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  /** Multi-file tools (Merge, image-to-PDF) allow reordering; single-file
   * tools don't render move controls at all. */
  reorderable?: boolean;
  disabled?: boolean;
}

export function FileList({
  items,
  onReorder,
  onRemove,
  reorderable = false,
  disabled,
}: FileListProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const labels = {
    moveUp: t("reorder.moveUp"),
    moveDown: t("reorder.moveDown"),
    remove: tCommon("buttons.removeFile"),
  };

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <FileListItem
          key={item.id}
          item={item}
          index={index}
          reorderable={reorderable}
          isFirst={index === 0}
          isLast={index === items.length - 1}
          onMove={(toIndex) => onReorder(index, toIndex)}
          onRemove={() => onRemove(item.id)}
          onDragStart={() => setDragIndex(index)}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== index) {
              onReorder(dragIndex, index);
            }
            setDragIndex(null);
          }}
          disabled={disabled}
          labels={labels}
        />
      ))}
    </ul>
  );
}
