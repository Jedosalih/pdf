"use client";

import { useCallback, useId, useState } from "react";
import type { DragEvent } from "react";
import { cn } from "@/lib/utils/cn";

interface FileDropzoneProps {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  label: string;
  hint?: string;
  browseLabel: string;
}

export function FileDropzone({
  accept,
  multiple = true,
  disabled,
  onFilesSelected,
  label,
  hint,
  browseLabel,
}: FileDropzoneProps) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      onFilesSelected(Array.from(fileList));
    },
    [onFilesSelected],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
        isDragging ? "border-primary bg-secondary" : "border-border bg-surface",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <p className="text-h3 font-semibold text-foreground">{label}</p>
      <label
        htmlFor={inputId}
        className="cursor-pointer text-body font-medium text-primary underline underline-offset-2"
      >
        {browseLabel}
      </label>
      {hint ? <p className="text-small text-muted-foreground">{hint}</p> : null}
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
