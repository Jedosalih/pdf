"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { FileUploader } from "@/components/tools/FileUploader";
import { ProcessingState } from "@/components/tools/ProcessingState";
import { ResultState } from "@/components/tools/ResultState";
import { StartOverButton } from "@/components/tools/StartOverButton";
import { useToolWorkflow, errorMessageKey } from "@/components/tools/useToolWorkflow";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";

const TOOL_ID = "split-pdf";

interface SplitPdfToolProps {
  maxFiles: number;
}

export function SplitPdfTool({ maxFiles }: SplitPdfToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const tSplit = useTranslations("tool.split-pdf");
  const [pagesPerFile, setPagesPerFile] = useState(1);

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
    uploadedCount >= 1 &&
    !hasErrors &&
    pagesPerFile >= 1 &&
    (flow === "selecting" || flow === "failed");

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
        <Input
          type="number"
          min={1}
          step={1}
          label={tSplit("options.pagesPerFileLabel")}
          hint={tSplit("options.pagesPerFileHint")}
          value={pagesPerFile}
          onChange={(event) => setPagesPerFile(Number(event.target.value))}
          className="max-w-40"
        />
      ) : null}

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
        <Button
          disabled={!canStart}
          onClick={() => start({ everyNPages: pagesPerFile })}
        >
          {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
        </Button>
      </div>
    </div>
  );
}
