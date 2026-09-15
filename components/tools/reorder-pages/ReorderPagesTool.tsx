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
import { usePdfPageThumbnails, type PdfPageThumbnail } from "@/components/tools/usePdfPageThumbnails";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";

const TOOL_ID = "reorder-pages";

interface ReorderPagesToolProps {
  maxFiles: number;
}

export function ReorderPagesTool({ maxFiles }: ReorderPagesToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const tReorder = useTranslations("tool.reorder-pages");
  const [order, setOrder] = useState<number[] | null>(null);

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

  const uploadedFile = uploadedCount > 0 ? (files[0]?.file ?? null) : null;
  const { pages, loading, error } = usePdfPageThumbnails(uploadedFile);

  // `order` only gets set once the user actually moves a page — until
  // then, derive display order directly from the loaded pages (no effect
  // needed just to mirror async data into state on first load).
  const displayOrder = order ?? pages.map((p) => p.pageNumber);
  const pageByNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const orderedPages = displayOrder
    .map((pageNumber) => pageByNumber.get(pageNumber))
    .filter((p): p is PdfPageThumbnail => Boolean(p));

  const canStart =
    uploadedCount >= 1 &&
    !hasErrors &&
    pages.length > 0 &&
    (flow === "selecting" || flow === "failed");

  const handleMove = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= displayOrder.length) return;
    const next = [...displayOrder];
    const [moved] = next.splice(fromIndex, 1);
    if (moved === undefined) return;
    next.splice(toIndex, 0, moved);
    setOrder(next);
  };

  const handleRemoveFile = () => {
    const file = files[0];
    if (file) handleRemove(file.localId);
    setOrder(null);
  };

  const handleReset = () => {
    setOrder(null);
    reset();
  };

  if (flow === "completed") {
    return (
      <ResultState
        title={t("result.title")}
        outputFiles={outputFiles}
        jobId={jobId}
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
            <p className="text-small text-muted-foreground">{tReorder("options.hint")}</p>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="shrink-0 text-small font-medium text-primary hover:underline"
            >
              {tCommon("buttons.removeFile")}
            </button>
          </div>
          <PageGrid
            items={orderedPages.map((p, index) => ({
              key: p.pageNumber,
              pageNumber: index + 1,
              dataUrl: p.dataUrl,
            }))}
            mode="reorder"
            onMove={handleMove}
            moveUpLabel={(n) => t("pages.moveEarlier", { number: n })}
            moveDownLabel={(n) => t("pages.moveLater", { number: n })}
          />
        </div>
      )}

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      {uploadedCount > 0 && !loading && !error ? (
        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
          <Button disabled={!canStart} onClick={() => start({ pageOrder: displayOrder })}>
            {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
