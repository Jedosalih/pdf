"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FileUploader } from "@/components/tools/FileUploader";
import { ProcessingState } from "@/components/tools/ProcessingState";
import { ResultState } from "@/components/tools/ResultState";
import { StartOverButton } from "@/components/tools/StartOverButton";
import { useToolWorkflow, errorMessageKey } from "@/components/tools/useToolWorkflow";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";

const TOOL_ID = "page-numbers";
const MAX_START_AT = 100_000;

const POSITIONS = [
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "top-center",
  "top-left",
  "top-right",
] as const;

interface PageNumbersToolProps {
  maxFiles: number;
}

export function PageNumbersTool({ maxFiles }: PageNumbersToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const tPageNumbers = useTranslations("tool.page-numbers");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("bottom-center");
  const [startAt, setStartAt] = useState("1");

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
  } = useToolWorkflow({ toolId: TOOL_ID, maxFiles });

  const startAtNumber = Number(startAt);
  const canStart =
    uploadedCount >= 1 &&
    !hasErrors &&
    Number.isInteger(startAtNumber) &&
    startAtNumber >= 1 &&
    startAtNumber <= MAX_START_AT &&
    (flow === "selecting" || flow === "failed");

  const positionOptions = POSITIONS.map((value) => ({
    value,
    label: tPageNumbers(`options.position.${value}`),
  }));

  if (flow === "completed") {
    return (
      <ResultState
        title={t("result.title")}
        outputFiles={outputFiles}
        jobId={jobId}
        downloadLabel={t("result.download")}
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
        reorderable={false}
        accept="application/pdf"
        multiple={false}
        maxFiles={maxFiles}
        onFilesSelected={handleFilesSelected}
        onReorder={handleReorder}
        onRemove={handleRemove}
        dropzoneLabel={t("upload.dropHere")}
        browseLabel={t("upload.orBrowse")}
        addMoreLabel={t("upload.orBrowse")}
      />

      {items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={tPageNumbers("options.positionLabel")}
            value={position}
            onValueChange={(value) => setPosition(value as (typeof POSITIONS)[number])}
            options={positionOptions}
          />
          <Input
            type="number"
            label={tPageNumbers("options.startAtLabel")}
            min={1}
            max={MAX_START_AT}
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
          />
        </div>
      ) : null}

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
        <Button
          disabled={!canStart}
          onClick={() => start({ position, startAt: startAtNumber })}
        >
          {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
        </Button>
      </div>
    </div>
  );
}
