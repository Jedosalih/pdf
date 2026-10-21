"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/Select";
import { FileUploader } from "@/components/tools/FileUploader";
import { ProcessingState } from "@/components/tools/ProcessingState";
import { ResultState } from "@/components/tools/ResultState";
import { StartOverButton } from "@/components/tools/StartOverButton";
import { useToolWorkflow, errorMessageKey } from "@/components/tools/useToolWorkflow";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";
import { formatFileSize } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/routing";

const TOOL_ID = "compress-pdf";
type CompressLevel = "basic" | "balanced" | "strong";

interface CompressPdfToolProps {
  maxFiles: number;
}

export function CompressPdfTool({ maxFiles }: CompressPdfToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const tCompress = useTranslations("tool.compress-pdf");
  const locale = useLocale() as Locale;
  const [level, setLevel] = useState<CompressLevel>("balanced");

  const {
    files,
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

  const canStart =
    uploadedCount >= 1 && !hasErrors && (flow === "selecting" || flow === "failed");

  const levelOptions = (["basic", "balanced", "strong"] as const).map((value) => ({
    value,
    label: tCompress(`options.levels.${value}`),
  }));

  if (flow === "completed") {
    const originalSize = files[0]?.file.size;
    const resultSize = outputFiles[0]?.size;
    return (
      <ResultState
        title={t("result.title")}
        outputFiles={outputFiles}
        jobId={jobId}
        downloadLabel={t("result.download")}
      >
        {originalSize !== undefined && resultSize !== undefined ? (
          resultSize < originalSize ? (
            <p className="text-small text-muted-foreground" data-testid="compress-summary">
              {tCompress("result.sizeSummary", {
                before: formatFileSize(originalSize, locale),
                after: formatFileSize(resultSize, locale),
              })}{" "}
              {tCompress("result.saved", { percent: Math.round((1 - resultSize / originalSize) * 100) })}
            </p>
          ) : (
            <p className="text-small text-muted-foreground" data-testid="compress-summary">
              {tCompress("result.alreadyOptimized")}
            </p>
          )
        ) : null}
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
          label={tCompress("options.levelLabel")}
          value={level}
          onValueChange={(value) => setLevel(value as CompressLevel)}
          options={levelOptions}
        />
      ) : null}

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
        <Button disabled={!canStart} onClick={() => start({ level })}>
          {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
        </Button>
      </div>
    </div>
  );
}
