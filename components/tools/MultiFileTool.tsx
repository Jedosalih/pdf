"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FileUploader } from "@/components/tools/FileUploader";
import { ProcessingState } from "@/components/tools/ProcessingState";
import { ResultState } from "@/components/tools/ResultState";
import { StartOverButton } from "@/components/tools/StartOverButton";
import { useToolWorkflow, errorMessageKey } from "@/components/tools/useToolWorkflow";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";

interface MultiFileToolProps {
  toolId: string;
  accept: string;
  maxFiles: number;
  /** Merge needs at least 2 files to be meaningful; image-to-PDF tools
   * produce a valid result from just 1. */
  minFiles?: number;
  reorderable?: boolean;
  /** False for single-file tools (PDF-to-JPG/PNG) so the native file
   * picker doesn't offer multi-select for a tool that only accepts one. */
  multiple?: boolean;
}

/**
 * Shared by every tool whose entire workflow is "upload N files (optionally
 * reorder), click Start, get one result" with no extra options — Merge
 * PDF, JPG-to-PDF, PNG-to-PDF today. A tool needing its own options (a
 * Select, page grid, etc.) builds its own component around
 * useToolWorkflow instead of this one.
 */
export function MultiFileTool({
  toolId,
  accept,
  maxFiles,
  minFiles = 1,
  reorderable = true,
  multiple = true,
}: MultiFileToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");

  const {
    items,
    flow,
    errorCode,
    outputFiles,
    jobId,
    uploadedCount,
    hasErrors,
    handleFilesSelected,
    handleReorder,
    handleRemove,
    start,
    reset,
  } = useToolWorkflow({ toolId, maxFiles });

  const canStart =
    uploadedCount >= minFiles &&
    !hasErrors &&
    (flow === "selecting" || flow === "failed");

  if (flow === "completed") {
    return (
      <ResultState
        title={t("result.title")}
        outputFiles={outputFiles}
        downloadLabel={t("result.download")}
        jobId={jobId}
      >
        <StartOverButton label={t("result.processAnother")} onClick={reset} />
      </ResultState>
    );
  }

  if (flow === "creating" || flow === "processing") {
    const steps: ProcessingStep[] = [
      { label: t("status.uploading"), state: "done" },
      {
        label: t("status.processing"),
        state: flow === "processing" ? "active" : "pending",
      },
    ];
    return (
      <ProcessingState
        title={flow === "creating" ? t("status.queued") : t("status.processing")}
        steps={steps}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FileUploader
        items={items}
        reorderable={reorderable}
        accept={accept}
        multiple={multiple}
        maxFiles={maxFiles}
        onFilesSelected={handleFilesSelected}
        onReorder={handleReorder}
        onRemove={handleRemove}
        dropzoneLabel={t("upload.dropHere")}
        browseLabel={t("upload.orBrowse")}
        hint={maxFiles > 1 ? t("upload.maxFiles", { count: maxFiles }) : undefined}
        addMoreLabel={t("upload.orBrowse")}
      />

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
        <Button disabled={!canStart} onClick={() => start()}>
          {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
        </Button>
      </div>
    </div>
  );
}
