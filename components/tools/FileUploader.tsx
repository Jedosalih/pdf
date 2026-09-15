"use client";

import { useCallback, useId, useState } from "react";
import type { ChangeEvent } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/Alert";
import { ToolDropzone } from "./ToolDropzone";
import { FileList, type FileListItem as FileListItemData } from "./FileList";

interface FileUploaderProps {
  items: FileListItemData[];
  reorderable: boolean;
  accept: string;
  multiple: boolean;
  maxFiles: number;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  dropzoneLabel: string;
  browseLabel: string;
  hint?: string;
  addMoreLabel: string;
}

/**
 * The full upload workspace: the empty-state dropzone, and once files
 * exist, the file list plus an "add more" affordance (for tools that
 * accept multiple files). One component so every tool's upload step looks
 * and behaves the same (blueprint: "Do not implement separate uploaders
 * for every tool").
 */
export function FileUploader({
  items,
  reorderable,
  accept,
  multiple,
  maxFiles,
  disabled,
  onFilesSelected,
  onReorder,
  onRemove,
  dropzoneLabel,
  browseLabel,
  hint,
  addMoreLabel,
}: FileUploaderProps) {
  const addMoreInputId = useId();
  const tCommon = useTranslations("common");
  const [hasRejectedFile, setHasRejectedFile] = useState(false);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      setHasRejectedFile(false);
      onFilesSelected(files);
    },
    [onFilesSelected],
  );

  const handleRejectedFiles = useCallback(() => {
    setHasRejectedFile(true);
  }, []);

  const handleAddMoreChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        handleFilesSelected(Array.from(event.target.files));
      }
      event.target.value = "";
    },
    [handleFilesSelected],
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <ToolDropzone
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onFilesSelected={handleFilesSelected}
          onRejectedFiles={handleRejectedFiles}
          label={dropzoneLabel}
          browseLabel={browseLabel}
          hint={hint}
        />
        {hasRejectedFile ? (
          <Alert variant="error">{tCommon("errors.unsupportedFile")}</Alert>
        ) : null}
      </div>
    );
  }

  const canAddMore = multiple && items.length < maxFiles;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <FileList
        items={items}
        onReorder={onReorder}
        onRemove={onRemove}
        reorderable={reorderable}
        disabled={disabled}
      />
      {canAddMore ? (
        <label
          htmlFor={addMoreInputId}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2.5 text-small font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {addMoreLabel}
          <input
            id={addMoreInputId}
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            className="sr-only"
            onChange={handleAddMoreChange}
          />
        </label>
      ) : null}
    </div>
  );
}
