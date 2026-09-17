"use client";

import { useCallback, useId, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/Button";

interface ToolDropzoneProps {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  /** Called with any dropped/selected files whose type doesn't match
   * `accept` — the server's magic-byte validation is the real security
   * boundary, this is just earlier, clearer UX feedback. */
  onRejectedFiles?: (files: File[]) => void;
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
  onRejectedFiles,
  label,
  hint,
  browseLabel,
}: ToolDropzoneProps) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const acceptedTypes = useMemo(
    () => accept.split(",").map((type) => type.trim()).filter(Boolean),
    [accept],
  );

  // `file.type` alone isn't reliable for every format: browsers have no
  // built-in MIME mapping for `.md`/`.markdown` and commonly report an
  // empty string for them, which would otherwise make a real, valid
  // Markdown file look "rejected" client-side even though the server
  // accepts it. `accept` can mix MIME types (`text/markdown`) and
  // extensions (`.md`) exactly like the native `accept` attribute does —
  // match on whichever the file actually satisfies.
  const isAccepted = useCallback(
    (file: File) => {
      const lowerName = file.name.toLowerCase();
      return acceptedTypes.some((entry) =>
        entry.startsWith(".") ? lowerName.endsWith(entry) : entry === file.type,
      );
    },
    [acceptedTypes],
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      if (!onRejectedFiles || acceptedTypes.length === 0) {
        onFilesSelected(files);
        return;
      }

      const accepted = files.filter((file) => isAccepted(file));
      const rejected = files.filter((file) => !isAccepted(file));
      if (accepted.length > 0) onFilesSelected(accepted);
      if (rejected.length > 0) onRejectedFiles(rejected);
    },
    [onFilesSelected, onRejectedFiles, acceptedTypes, isAccepted],
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
