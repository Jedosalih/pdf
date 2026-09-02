"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatFileSize } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/routing";
import type { FileListItem } from "./FileList";

const POLL_INTERVAL_MS = 1500;

export interface TrackedFile {
  localId: string;
  file: File;
  serverId?: string;
  status: "uploading" | "uploaded" | "error";
  errorCode?: string;
}

export type FlowState = "selecting" | "creating" | "processing" | "completed" | "failed";

export interface JobOutputFile {
  id: string;
  name: string;
  size: number;
}

interface JobStatusResponse {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";
  errorCode: string | null;
  outputFiles: JobOutputFile[];
}

export function errorMessageKey(code: string | undefined): string {
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
    case "INVALID_PASSWORD":
      return "invalidPassword";
    default:
      return "generic";
  }
}

interface UseToolWorkflowOptions {
  toolId: string;
  maxFiles: number;
}

/**
 * The single orchestration hook behind every tool page: upload -> (options)
 * -> create job -> poll -> download. Tool pages only differ in accepted
 * mime type, whether multiple files are allowed, and whatever tool-specific
 * options they collect before calling `start(options)` — everything else
 * (upload, entitlement errors, polling, download) lives here once instead
 * of being re-implemented per tool.
 */
export function useToolWorkflow({ toolId, maxFiles }: UseToolWorkflowOptions) {
  const t = useTranslations("tools");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;

  const [files, setFiles] = useState<TrackedFile[]>([]);
  const [flow, setFlow] = useState<FlowState>("selecting");
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [outputFiles, setOutputFiles] = useState<JobOutputFile[]>([]);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items: FileListItem[] = useMemo(
    () =>
      files.map((tracked) => ({
        id: tracked.localId,
        name: tracked.file.name,
        mimeType: tracked.file.type,
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

  const uploadFile = useCallback(
    async (localId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("toolId", toolId);

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
    },
    [toolId],
  );

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

      if (data.status === "COMPLETED") {
        setOutputFiles(data.outputFiles);
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

  const start = useCallback(
    async (options?: Record<string, unknown>) => {
      setFlow("creating");
      setErrorCode(undefined);

      const fileIds = files
        .filter((f) => f.status === "uploaded" && f.serverId)
        .map((f) => f.serverId as string);

      try {
        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolId, fileIds, options }),
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
    },
    [files, pollJob, toolId],
  );

  const reset = useCallback(() => {
    if (pollTimeout.current) clearTimeout(pollTimeout.current);
    setFiles([]);
    setFlow("selecting");
    setErrorCode(undefined);
    setOutputFiles([]);
  }, []);

  const uploadedCount = files.filter((f) => f.status === "uploaded").length;
  const hasErrors = files.some((f) => f.status === "error");

  return {
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
  };
}
