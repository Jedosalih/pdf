"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, X } from "lucide-react";
import { formatFileSize } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/routing";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import { ToolDropzone } from "@/components/tools/ToolDropzone";
import { errorMessageKey, type JobOutputFile } from "@/components/tools/useToolWorkflow";
import {
  BATCHABLE_TOOL_IDS,
  BATCH_DEFAULT_OPTIONS,
  BATCH_MAX_FILES,
  type BatchableToolId,
} from "@/lib/tools/batch";
import type { ToolLimits } from "@/lib/tools/types";

const POLL_INTERVAL_MS = 1500;

type EntryStatus =
  | "uploading"
  | "upload-error"
  | "ready"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

interface BatchEntry {
  localId: string;
  file: File;
  status: EntryStatus;
  errorCode?: string;
  serverId?: string;
  jobId?: string;
  outputFiles?: JobOutputFile[];
}

interface BatchProcessToolProps {
  limitsByTool: Record<BatchableToolId, ToolLimits>;
}

export function BatchProcessTool({ limitsByTool }: BatchProcessToolProps) {
  const t = useTranslations("batch");
  const tCommon = useTranslations("common");
  const tTools = useTranslations("tools");
  const locale = useLocale() as Locale;

  // Fixed, statically-known set of translators -- one per batchable tool,
  // not a dynamic per-item hook call.
  const labelsByTool: Record<BatchableToolId, string> = {
    "compress-pdf": useTranslations("tool.compress-pdf")("h1"),
    "flatten-pdf": useTranslations("tool.flatten-pdf")("h1"),
    "repair-pdf": useTranslations("tool.repair-pdf")("h1"),
    "pdf-to-pdfa": useTranslations("tool.pdf-to-pdfa")("h1"),
    "pdf-to-text": useTranslations("tool.pdf-to-text")("h1"),
  };

  const [selectedTool, setSelectedTool] = useState<BatchableToolId>("compress-pdf");
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  const limits = limitsByTool[selectedTool];

  const updateEntry = useCallback((localId: string, patch: Partial<BatchEntry>) => {
    setEntries((prev) => prev.map((e) => (e.localId === localId ? { ...e, ...patch } : e)));
  }, []);

  const uploadFile = useCallback(
    async (localId: string, file: File, toolId: BatchableToolId) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("toolId", toolId);
      try {
        const response = await fetch("/api/upload", { method: "POST", body: formData });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          updateEntry(localId, { status: "upload-error", errorCode: body?.error?.code });
          return;
        }
        const data = (await response.json()) as { fileId: string };
        updateEntry(localId, { status: "ready", serverId: data.fileId });
      } catch {
        updateEntry(localId, { status: "upload-error" });
      }
    },
    [updateEntry],
  );

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      // BATCH_MAX_FILES caps how many files this batch can contain --
      // deliberately not the underlying tool's own ToolLimits.maxFiles,
      // which caps files *per job* (1, for every batchable tool here) and
      // is unrelated to how many independent jobs a batch can fan out to.
      const room = Math.max(0, BATCH_MAX_FILES - entries.length);
      const accepted = files.slice(0, room);
      const newEntries: BatchEntry[] = accepted.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        status: "uploading",
      }));
      setEntries((prev) => [...prev, ...newEntries]);
      for (const entry of newEntries) {
        void uploadFile(entry.localId, entry.file, selectedTool);
      }
    },
    [entries.length, selectedTool, uploadFile],
  );

  const pollJob = useCallback(
    (localId: string, jobId: string) => {
      const tick = async () => {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) {
          updateEntry(localId, { status: "failed", errorCode: "generic" });
          return;
        }
        const data = (await response.json()) as {
          status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";
          errorCode: string | null;
          outputFiles: JobOutputFile[];
        };
        if (data.status === "COMPLETED") {
          updateEntry(localId, { status: "completed", outputFiles: data.outputFiles });
        } else if (
          data.status === "FAILED" ||
          data.status === "CANCELLED" ||
          data.status === "EXPIRED"
        ) {
          updateEntry(localId, { status: "failed", errorCode: data.errorCode ?? "generic" });
        } else {
          updateEntry(localId, {
            status: data.status === "PROCESSING" ? "processing" : "queued",
          });
          pollTimers.current.set(localId, setTimeout(tick, POLL_INTERVAL_MS));
        }
      };
      void tick();
    },
    [updateEntry],
  );

  const handleStartBatch = useCallback(() => {
    const readyEntries = entries.filter((e) => e.status === "ready" && e.serverId);
    for (const entry of readyEntries) {
      updateEntry(entry.localId, { status: "queued" });
      void (async () => {
        try {
          const response = await fetch("/api/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toolId: selectedTool,
              fileIds: [entry.serverId],
              options: BATCH_DEFAULT_OPTIONS[selectedTool],
            }),
          });
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            updateEntry(entry.localId, {
              status: "failed",
              errorCode: body?.error?.code ?? "generic",
            });
            return;
          }
          const data = (await response.json()) as { jobId: string };
          updateEntry(entry.localId, { jobId: data.jobId });
          pollJob(entry.localId, data.jobId);
        } catch {
          updateEntry(entry.localId, { status: "failed", errorCode: "generic" });
        }
      })();
    }
  }, [entries, selectedTool, updateEntry, pollJob]);

  const handleRemoveEntry = useCallback((localId: string) => {
    const timer = pollTimers.current.get(localId);
    if (timer) {
      clearTimeout(timer);
      pollTimers.current.delete(localId);
    }
    setEntries((prev) => prev.filter((e) => e.localId !== localId));
  }, []);

  const handleToolChange = useCallback((value: string) => {
    setSelectedTool(value as BatchableToolId);
    setEntries([]);
  }, []);

  const hasReadyEntries = entries.some((e) => e.status === "ready");
  const isBatchActive = entries.some(
    (e) => e.status === "queued" || e.status === "processing" || e.status === "uploading",
  );

  const statusLabel = (entry: BatchEntry): string => {
    switch (entry.status) {
      case "uploading":
        return tTools("status.uploading");
      case "upload-error":
        return tCommon(`errors.${errorMessageKey(entry.errorCode)}`);
      case "ready":
        return tTools("status.ready");
      case "queued":
        return tTools("status.queued");
      case "processing":
        return tTools("status.processing");
      case "completed":
        return t("entry.done");
      case "failed":
        return tCommon(`errors.${errorMessageKey(entry.errorCode)}`);
    }
  };

  const toolOptions = BATCHABLE_TOOL_IDS.map((id) => ({ value: id, label: labelsByTool[id] }));

  return (
    <div className="flex flex-col gap-6">
      <Select
        label={t("toolLabel")}
        value={selectedTool}
        onValueChange={handleToolChange}
        options={toolOptions}
        disabled={isBatchActive}
      />

      <ToolDropzone
        accept="application/pdf"
        multiple
        onFilesSelected={handleFilesSelected}
        label={t("dropLabel")}
        browseLabel={tTools("upload.orBrowse")}
        hint={t("hint", {
          count: BATCH_MAX_FILES,
          size: formatFileSize(limits.maxFileSizeBytes, locale),
        })}
      />

      {entries.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.localId}
              className="flex items-center gap-3 rounded-md border border-border bg-background p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-foreground">
                  {entry.file.name}
                </p>
                <p
                  className={`text-caption ${
                    entry.status === "failed" || entry.status === "upload-error"
                      ? "text-error"
                      : "text-muted-foreground"
                  }`}
                >
                  {statusLabel(entry)}
                </p>
              </div>
              {entry.status === "completed" && entry.outputFiles?.[0] ? (
                <a
                  href={`/api/files/${entry.outputFiles[0].id}/download`}
                  className="flex items-center gap-1.5 text-small font-medium text-primary hover:underline"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {tTools("result.download")}
                </a>
              ) : null}
              {entry.status !== "queued" && entry.status !== "processing" ? (
                <IconButton
                  label={tCommon("buttons.removeFile")}
                  variant="ghost"
                  onClick={() => handleRemoveEntry(entry.localId)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-muted-foreground">{tTools("privacyNote")}</p>
        <Button disabled={!hasReadyEntries} onClick={handleStartBatch}>
          {t("startBatch")}
        </Button>
      </div>

      {entries.some((e) => e.status === "upload-error") ? (
        <Alert variant="error">{t("someUploadsFailed")}</Alert>
      ) : null}
    </div>
  );
}
