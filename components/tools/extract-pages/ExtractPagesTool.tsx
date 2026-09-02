"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FileUploader } from "@/components/tools/FileUploader";
import { ProcessingState } from "@/components/tools/ProcessingState";
import { ResultState } from "@/components/tools/ResultState";
import { StartOverButton } from "@/components/tools/StartOverButton";
import { PageGrid } from "@/components/tools/PageGrid";
import { useToolWorkflow, errorMessageKey } from "@/components/tools/useToolWorkflow";
import { usePdfPageThumbnails } from "@/components/tools/usePdfPageThumbnails";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";

const TOOL_ID = "extract-pages";

interface ExtractPagesToolProps {
  maxFiles: number;
}

export function ExtractPagesTool({ maxFiles }: ExtractPagesToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const tExtract = useTranslations("tool.extract-pages");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const {
    files,
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

  const uploadedFile = uploadedCount > 0 ? (files[0]?.file ?? null) : null;
  const { pages, loading, error } = usePdfPageThumbnails(uploadedFile);

  const canStart =
    uploadedCount >= 1 &&
    !hasErrors &&
    selected.size > 0 &&
    (flow === "selecting" || flow === "failed");

  const toggle = (pageNumber: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  };

  const handleRemoveFile = () => {
    const file = files[0];
    if (file) handleRemove(file.localId);
    setSelected(new Set());
  };

  const handleReset = () => {
    setSelected(new Set());
    reset();
  };

  if (flow === "completed") {
    return (
      <ResultState
        title={t("result.title")}
        outputFiles={outputFiles}
        downloadLabel={t("result.download")}
      >
        <StartOverButton label={t("result.processAnother")} onClick={handleReset} />
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
      {uploadedCount === 0 ? (
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
      ) : loading ? (
        <p className="py-10 text-center text-small text-muted-foreground">
          {t("pages.loading")}
        </p>
      ) : error ? (
        <Alert variant="error">{t("pages.error")}</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-small text-muted-foreground">{tExtract("options.hint")}</p>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="shrink-0 text-small font-medium text-primary hover:underline"
            >
              {tCommon("buttons.removeFile")}
            </button>
          </div>
          <PageGrid
            items={pages.map((p) => ({
              key: p.pageNumber,
              pageNumber: p.pageNumber,
              dataUrl: p.dataUrl,
              selected: selected.has(p.pageNumber),
            }))}
            mode="select"
            onToggle={toggle}
            toggleLabel={(n) =>
              selected.has(n)
                ? t("pages.deselectPage", { number: n })
                : t("pages.selectPage", { number: n })
            }
          />
          <p className="text-small text-muted-foreground">
            {t("pages.selectedCount", { count: selected.size, total: pages.length })}
          </p>
        </div>
      )}

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      {uploadedCount > 0 && !loading && !error ? (
        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
          <Button
            disabled={!canStart}
            onClick={() => start({ pagesToKeep: [...selected] })}
          >
            {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
