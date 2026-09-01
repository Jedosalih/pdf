"use client";

import { useCallback, useId, useState } from "react";
import type { DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/Button";

interface ToolDropzoneProps {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  label: string;
  hint?: string;
  browseLabel: string;
}

/** The one upload surface every tool uses — see docs/DESIGN_RESEARCH.md
 * ("immediate upload affordance"). Drag & drop, click-to-browse, and a
 * real (keyboard-reachable) file input underneath. */
export function ToolDropzone({
  accept,
  multiple = true,
  disabled,
  onFilesSelected,
  label,
  hint,
  browseLabel,
}: ToolDropzoneProps) {
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
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors sm:p-16",
        isDragging ? "border-primary bg-secondary/60" : "border-border bg-surface",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
        <UploadCloud className="h-6 w-6" aria-hidden="true" />
      </div>
      <p className="text-h3 font-semibold text-foreground">{label}</p>
      <label htmlFor={inputId} className={cn(buttonVariants({ variant: "secondary" }), "cursor-pointer")}>
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
