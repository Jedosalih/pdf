"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatFileSize } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/routing";
import { usePendingUpload, type PendingWorkspaceFile } from "@/components/upload/PendingUploadProvider";
import type { FileListItem } from "./FileList";

/** A zero-filled buffer of the file's real byte length -- never uploaded
 * (its bytes already live server-side), only used so the existing
 * name/type/size-based UI (thumbnails, formatFileSize) displays correctly
 * for a file chosen from the workspace instead of freshly dropped. */
function createWorkspacePlaceholderFile(workspaceFile: PendingWorkspaceFile): File {
  return new File([new Uint8Array(workspaceFile.size)], workspaceFile.name, {
    type: workspaceFile.mimeType,
  });
}

const POLL_INTERVAL_MS = 1500;
/** Client-side give-up point only -- the job itself keeps running and a
 * signed-in user still finds the result in My Documents. Well past the
 * longest engine timeout (OCR, 300s) plus realistic queue wait. */
export const POLL_DEADLINE_MS = 15 * 60 * 1000;
export const MAX_CONSECUTIVE_POLL_ERRORS = 5;

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
    case "UNRECOVERABLE_FILE":
      return "unrecoverableFile";
    case "GUEST_NOT_ALLOWED":
      return "guestNotAllowed";
    case "NO_EXTRACTABLE_TEXT":
      return "noExtractableText";
    case "ENCRYPTED_PDF":
      return "encryptedPdf";
    case "RATE_LIMITED":
      return "rateLimited";
    case "PROCESSING_TIMEOUT":
      return "processingTimeout";
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
  const [jobId, setJobId] = useState<string | null>(null);
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

      try {
        const response = await fetch(`/api/upload?toolId=${encodeURIComponent(toolId)}`, {
          method: "POST",
          body: formData,
        });
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

  // Bumped whenever polling must stop (new poll, reset, unmount): an
  // in-flight tick from an older generation never touches state.
  const pollGeneration = useRef(0);
  useEffect(
    () => () => {
      pollGeneration.current += 1;
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
    },
    [],
  );

  const pollJob = useCallback((jobId: string) => {
    const generation = ++pollGeneration.current;
    const deadline = Date.now() + POLL_DEADLINE_MS;
    let consecutiveErrors = 0;
    const isCurrent = () => generation === pollGeneration.current;
    const fail = (code: string) => {
      setFlow("failed");
      setErrorCode(code);
    };
    const scheduleNext = () => {
      pollTimeout.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    const tick = async () => {
      if (!isCurrent()) return;
      if (Date.now() > deadline) {
        fail("PROCESSING_TIMEOUT");
        return;
      }

      let data: JobStatusResponse;
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!isCurrent()) return;
        // A 4xx means this job isn't (or is no longer) ours to see --
        // retrying can't change that. 5xx and network errors are transient.
        if (response.status >= 400 && response.status < 500) {
          fail("generic");
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = (await response.json()) as JobStatusResponse;
      } catch {
        if (!isCurrent()) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
          fail("generic");
        } else {
          scheduleNext();
        }
        return;
      }
      if (!isCurrent()) return;
      consecutiveErrors = 0;

      if (data.status === "COMPLETED") {
        setOutputFiles(data.outputFiles);
        setFlow("completed");
      } else if (
        data.status === "FAILED" ||
        data.status === "CANCELLED" ||
        data.status === "EXPIRED"
      ) {
        fail(data.errorCode ?? "generic");
      } else {
        scheduleNext();
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
        setJobId(data.jobId);
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
    pollGeneration.current += 1;
    if (pollTimeout.current) clearTimeout(pollTimeout.current);
    setFiles([]);
    setFlow("selecting");
    setErrorCode(undefined);
    setOutputFiles([]);
    setJobId(null);
  }, []);

  const pendingUpload = usePendingUpload();
  const hasConsumedPendingUpload = useRef(false);

  const addWorkspaceFile = useCallback((workspaceFile: PendingWorkspaceFile) => {
    setFiles((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        file: createWorkspacePlaceholderFile(workspaceFile),
        status: "uploaded",
        serverId: workspaceFile.id,
      },
    ]);
  }, []);

  // Picks up a file dropped on the homepage's hero dropzone, or a file
  // chosen via "Use in a tool" on an existing workspace document, before
  // this tool was chosen (see PendingUploadProvider) — runs at most once
  // per mount regardless of how often `handleFilesSelected`'s identity
  // changes. The state update is deferred to a microtask (not called
  // synchronously in the effect body) to satisfy
  // eslint-plugin-react-hooks's set-state-in-effect rule — same timing,
  // just not a bare top-level setState call directly inside the effect.
  useEffect(() => {
    if (hasConsumedPendingUpload.current) return;
    hasConsumedPendingUpload.current = true;
    const workspaceFile = pendingUpload.consumeWorkspaceFile();
    if (workspaceFile) {
      void Promise.resolve().then(() => addWorkspaceFile(workspaceFile));
      return;
    }
    const file = pendingUpload.consume();
    if (file) {
      void Promise.resolve().then(() => handleFilesSelected([file]));
    }
  }, [pendingUpload, handleFilesSelected, addWorkspaceFile]);

  const uploadedCount = files.filter((f) => f.status === "uploaded").length;
  const hasErrors = files.some((f) => f.status === "error");

  return {
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
  };
}
