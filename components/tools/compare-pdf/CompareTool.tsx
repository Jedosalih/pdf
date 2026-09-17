"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ToolDropzone } from "@/components/tools/ToolDropzone";
import { FileThumbnail } from "@/components/tools/FileThumbnail";
import { ProcessingState } from "@/components/tools/ProcessingState";
import { ResultState } from "@/components/tools/ResultState";
import { StartOverButton } from "@/components/tools/StartOverButton";
import {
  useToolWorkflow,
  errorMessageKey,
  type TrackedFile,
} from "@/components/tools/useToolWorkflow";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";

const TOOL_ID = "compare-pdf";

interface CompareToolProps {
  maxFiles: number;
}

interface SlotProps {
  testId: string;
  label: string;
  file: TrackedFile | undefined;
  disabled: boolean;
  removable: boolean;
  dropLabel: string;
  browseLabel: string;
  statusLabel: (file: TrackedFile) => string;
  onFilesSelected: (files: File[]) => void;
  onRemove: (id: string) => void;
}

function Slot({
  testId,
  label,
  file,
  disabled,
  removable,
  dropLabel,
  browseLabel,
  statusLabel,
  onFilesSelected,
  onRemove,
}: SlotProps) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <p className="text-small font-medium text-foreground">{label}</p>
      {file ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-background p-2.5">
          <FileThumbnail mimeType={file.file.type} status={file.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-small font-medium text-foreground">{file.file.name}</p>
            <p className="text-caption text-muted-foreground">{statusLabel(file)}</p>
          </div>
          {removable ? (
            <IconButton label="Remove" variant="ghost" onClick={() => onRemove(file.localId)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
      ) : (
        <ToolDropzone
          accept="application/pdf"
          multiple={false}
          disabled={disabled}
          onFilesSelected={(selected) => onFilesSelected(selected.slice(0, 1))}
          label={dropLabel}
          browseLabel={browseLabel}
        />
      )}
    </div>
  );
}

export function CompareTool({ maxFiles }: CompareToolProps) {
  const t = useTranslations("tool.compare-pdf");
  const tCommon = useTranslations("common");
  const tTools = useTranslations("tools");

  const {
    files,
    flow,
    errorCode,
    outputFiles,
    jobId,
    hasErrors,
    handleFilesSelected,
    handleRemove,
    start,
    reset,
  } = useToolWorkflow({ toolId: TOOL_ID, maxFiles });

  const original = files[0];
  const revised = files[1];
  const bothUploaded = original?.status === "uploaded" && revised?.status === "uploaded";
  const canStart = bothUploaded && !hasErrors && (flow === "selecting" || flow === "failed");

  const statusLabel = (file: TrackedFile) =>
    file.status === "uploading"
      ? tTools("status.uploading")
      : file.status === "error"
        ? tCommon(`errors.${errorMessageKey(file.errorCode)}`)
        : tTools("status.ready");

  if (flow === "completed") {
    return (
      <ResultState
        title={tTools("result.title")}
        outputFiles={outputFiles}
        jobId={jobId}
        downloadLabel={tTools("result.download")}
      >
        <StartOverButton label={tTools("result.processAnother")} onClick={reset} />
      </ResultState>
    );
  }

  if (flow === "creating" || flow === "processing") {
    const steps: ProcessingStep[] = [
      { label: tTools("status.uploading"), state: "done" },
      { label: tTools("status.processing"), state: flow === "processing" ? "active" : "pending" },
    ];
    return (
      <ProcessingState
        title={flow === "creating" ? tTools("status.queued") : tTools("status.processing")}
        steps={steps}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slot
          testId="compare-slot-original"
          label={t("slots.original")}
          file={original}
          disabled={false}
          removable={!revised}
          dropLabel={t("slots.originalDrop")}
          browseLabel={tTools("upload.orBrowse")}
          statusLabel={statusLabel}
          onFilesSelected={handleFilesSelected}
          onRemove={handleRemove}
        />
        <Slot
          testId="compare-slot-revised"
          label={t("slots.revised")}
          file={revised}
          disabled={!original}
          removable
          dropLabel={t("slots.revisedDrop")}
          browseLabel={tTools("upload.orBrowse")}
          statusLabel={statusLabel}
          onFilesSelected={handleFilesSelected}
          onRemove={handleRemove}
        />
      </div>

      {flow === "failed" ? (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">{tTools("privacyNote")}</p>
        <Button disabled={!canStart} onClick={() => start()}>
          {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
        </Button>
      </div>
    </div>
  );
}
