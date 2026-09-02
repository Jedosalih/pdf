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

const TOOL_ID = "pdf-metadata";
const MAX_FIELD_LENGTH = 200;

interface PdfMetadataToolProps {
  maxFiles: number;
}

export function PdfMetadataTool({ maxFiles }: PdfMetadataToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const tMetadata = useTranslations("tool.pdf-metadata");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [subject, setSubject] = useState("");
  const [keywords, setKeywords] = useState("");

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

  const fields = [title, author, subject, keywords];
  const canStart =
    uploadedCount >= 1 &&
    !hasErrors &&
    fields.some((value) => value.trim().length > 0) &&
    fields.every((value) => value.length <= MAX_FIELD_LENGTH) &&
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
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={tMetadata("options.titleLabel")}
              placeholder={tMetadata("options.titlePlaceholder")}
              value={title}
              maxLength={MAX_FIELD_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              label={tMetadata("options.authorLabel")}
              placeholder={tMetadata("options.authorPlaceholder")}
              value={author}
              maxLength={MAX_FIELD_LENGTH}
              onChange={(event) => setAuthor(event.target.value)}
            />
            <Input
              label={tMetadata("options.subjectLabel")}
              placeholder={tMetadata("options.subjectPlaceholder")}
              value={subject}
              maxLength={MAX_FIELD_LENGTH}
              onChange={(event) => setSubject(event.target.value)}
            />
            <Input
              label={tMetadata("options.keywordsLabel")}
              placeholder={tMetadata("options.keywordsPlaceholder")}
              hint={tMetadata("options.keywordsHint")}
              value={keywords}
              maxLength={MAX_FIELD_LENGTH}
              onChange={(event) => setKeywords(event.target.value)}
            />
          </div>
          <p className="text-small text-muted-foreground">{tMetadata("options.hint")}</p>
        </div>
      ) : null}

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
        <Button
          disabled={!canStart}
          onClick={() => start({ title, author, subject, keywords })}
        >
          {flow === "failed" ? tCommon("buttons.retry") : tCommon("buttons.startProcessing")}
        </Button>
      </div>
    </div>
  );
}
