"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Progress } from "@/components/ui/Progress";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { FileList, type FileListItem } from "@/components/tools/FileList";
import { formatFileSize } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/routing";

const TOOL_ID = "merge-pdf";
const POLL_INTERVAL_MS = 1500;

interface TrackedFile {
  localId: string;
  file: File;
  serverId?: string;
  status: "uploading" | "uploaded" | "error";
  errorCode?: string;
}

type FlowState = "selecting" | "creating" | "processing" | "completed" | "failed";

interface JobStatusResponse {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";
  errorCode: string | null;
  outputFiles: { id: string; name: string; size: number }[];
}

function errorMessageKey(code: string | undefined): string {
  switch (code) {
    case "UNSUPPORTED_FILE":
      return "unsupportedFile";
    case "FILE_TOO_LARGE":
      return "fileTooLarge";
    case "TOO_MANY_FILES":
      return "tooManyFiles";
    case "TOO_MANY_PAGES":
      return "tooManyPages";
    case "DAILY_LIMIT_REACHED":
      return "limitReached";
    default:
      return "generic";
  }
}

interface MergePdfToolProps {
  maxFiles: number;
}

export function MergePdfTool({ maxFiles }: MergePdfToolProps) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;

  const [files, setFiles] = useState<TrackedFile[]>([]);
  const [flow, setFlow] = useState<FlowState>("selecting");
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items: FileListItem[] = useMemo(
    () =>
      files.map((tracked) => ({
        id: tracked.localId,
        name: tracked.file.name,
        status: tracked.status,
        statusLabel:
          tracked.status === "uploading"
            ? t("status.uploading")
            : tracked.status === "error"
              ? tCommon(`errors.${errorMessageKey(tracked.errorCode)}`)
              : formatFileSize(tracked.file.size, locale),
      })),
    [files, locale, t, tCommon],
  );

  const uploadFile = useCallback(async (localId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("toolId", TOOL_ID);

    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFiles((prev) =>
          prev.map((f) =>
            f.localId === localId
              ? { ...f, status: "error", errorCode: body?.error?.code }
              : f,
          ),
        );
        return;
      }
      const data = (await response.json()) as { fileId: string };
      setFiles((prev) =>
        prev.map((f) =>
          f.localId === localId
            ? { ...f, status: "uploaded", serverId: data.fileId }
            : f,
        ),
      );
    } catch {
      setFiles((prev) =>
        prev.map((f) => (f.localId === localId ? { ...f, status: "error" } : f)),
      );
    }
  }, []);

  const handleFilesSelected = useCallback(
    (selected: File[]) => {
      const room = Math.max(0, maxFiles - files.length);
      const accepted = selected.slice(0, room);
      const newTracked: TrackedFile[] = accepted.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        status: "uploading",
      }));
      setFiles((prev) => [...prev, ...newTracked]);
      for (const tracked of newTracked) {
        void uploadFile(tracked.localId, tracked.file);
      }
    },
    [files.length, maxFiles, uploadFile],
  );

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setFiles((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.localId !== id));
  }, []);

  const pollJob = useCallback((jobId: string) => {
    const tick = async () => {
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) {
        setFlow("failed");
        setErrorCode("generic");
        return;
      }
      const data = (await response.json()) as JobStatusResponse;
      setJob(data);

      if (data.status === "COMPLETED") {
        setFlow("completed");
      } else if (
        data.status === "FAILED" ||
        data.status === "CANCELLED" ||
        data.status === "EXPIRED"
      ) {
        setFlow("failed");
        setErrorCode(data.errorCode ?? "generic");
      } else {
        pollTimeout.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    void tick();
  }, []);

  const handleStart = useCallback(async () => {
    setFlow("creating");
    setErrorCode(undefined);

    const fileIds = files
      .filter((f) => f.status === "uploaded" && f.serverId)
      .map((f) => f.serverId as string);

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: TOOL_ID, fileIds }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFlow("failed");
        setErrorCode(body?.error?.code);
        return;
      }
      const data = (await response.json()) as { jobId: string };
      setFlow("processing");
      pollJob(data.jobId);
    } catch {
      setFlow("failed");
      setErrorCode("generic");
    }
  }, [files, pollJob]);

  const handleReset = useCallback(() => {
    if (pollTimeout.current) clearTimeout(pollTimeout.current);
    setFiles([]);
    setFlow("selecting");
    setErrorCode(undefined);
    setJob(null);
  }, []);

  const uploadedCount = files.filter((f) => f.status === "uploaded").length;
  const hasErrors = files.some((f) => f.status === "error");
  const canStart = uploadedCount >= 2 && !hasErrors && flow === "selecting";

  if (flow === "completed" && job) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background p-10 text-center">
        <p className="text-h2 font-semibold text-foreground">{t("result.title")}</p>
        {job.outputFiles.map((file) => (
          <a
            key={file.id}
            href={`/api/files/${file.id}/download`}
            className={buttonVariants({ size: "lg" })}
          >
            {t("result.download")}
          </a>
        ))}
        <Button variant="ghost" onClick={handleReset}>
          {t("result.processAnother")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {flow === "selecting" && (
        <FileDropzone
          accept="application/pdf"
          multiple
          onFilesSelected={handleFilesSelected}
          label={t("upload.dropHere")}
          browseLabel={t("upload.orBrowse")}
          hint={t("upload.maxFiles", { count: maxFiles })}
        />
      )}

      {items.length > 0 && flow === "selecting" && (
        <FileList
          items={items}
          onReorder={handleReorder}
          onRemove={handleRemove}
          removeLabel={tCommon("buttons.removeFile")}
          moveUpLabel={t("reorder.moveUp")}
          moveDownLabel={t("reorder.moveDown")}
        />
      )}

      {(flow === "creating" || flow === "processing") && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-10 text-center">
          <p className="text-h3 font-semibold text-foreground">
            {flow === "creating" ? t("status.queued") : t("status.processing")}
          </p>
          <Progress className="max-w-xs" label={t("status.processing")} />
        </div>
      )}

      {flow === "failed" && (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      )}

      {flow === "selecting" && (
        <div className="flex items-center justify-between">
          <p className="text-small text-muted-foreground">{t("privacyNote")}</p>
          <Button disabled={!canStart} onClick={handleStart}>
            {tCommon("buttons.startProcessing")}
          </Button>
        </div>
      )}

      {flow === "failed" && (
        <div>
          <Button variant="secondary" onClick={handleReset}>
            {tCommon("buttons.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
