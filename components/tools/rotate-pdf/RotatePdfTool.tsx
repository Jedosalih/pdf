"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/Select";
import { FileUploader } from "@/components/tools/FileUploader";
import { ProcessingState } from "@/components/tools/ProcessingState";
import { ResultState } from "@/components/tools/ResultState";
import { StartOverButton } from "@/components/tools/StartOverButton";
import { useToolWorkflow, errorMessageKey } from "@/components/tools/useToolWorkflow";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";

const TOOL_ID = "rotate-pdf";

interface RotatePdfToolProps {
  maxFiles: number;
}

export function RotatePdfTool({ maxFiles }: RotatePdfToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const tRotate = useTranslations("tool.rotate-pdf");
  const [degrees, setDegrees] = useState("90");

  const {
    items,
    flow,
    errorCode,
    outputFiles,
    uploadedCount,
    hasErrors,
    handleFilesSelected,
    handleReorder,
    handleRemove,
    start,
    reset,
  } = useToolWorkflow({ toolId: TOOL_ID, maxFiles });

  const canStart =
    uploadedCount >= 1 && !hasErrors && (flow === "selecting" || flow === "failed");

  const degreeOptions = (["90", "180", "270"] as const).map((value) => ({
    value,
    label: tRotate(`options.degrees.${value}`),
  }));

  if (flow === "completed") {
    return (
      <ResultState
        title={t("result.title")}
        outputFiles={outputFiles}
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
        <Select
          label={tRotate("options.degreesLabel")}
          value={degrees}
          onValueChange={setDegrees}
          options={degreeOptions}
        />
      ) : null}

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
        <Button
          disabled={!canStart}
          onClick={() => start({ degrees: Number(degrees) })}
        >
          {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
        </Button>
      </div>
    </div>
  );
}
