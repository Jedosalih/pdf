"use client";

import { MoreVertical, Download, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/routing";
import { IconButton } from "@/components/ui/IconButton";
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from "@/components/ui/Dropdown";

export interface HistoryJobSummary {
  id: string;
  toolId: string;
  fileName: string;
  status: string;
  createdAt: string;
  outputFiles: { id: string; name: string; size: number }[];
}

export function HistoryRow({
  job,
  onHide,
}: {
  job: HistoryJobSummary;
  onHide: () => void;
}) {
  const t = useTranslations("workspace");
  // Each row's tool name comes from its own tool's translation namespace —
  // called here (a proper component), not precomputed in a loop, since a
  // dynamic namespace argument to useTranslations is only valid when the
  // hook itself is invoked from a real component/hook body.
  const toolT = useTranslations(`tool.${job.toolId}`);
  const locale = useLocale() as Locale;
  const primaryOutput = job.outputFiles[0];

  const statusLabel =
    job.status === "COMPLETED"
      ? t("recent.statusCompleted")
      : job.status === "FAILED"
        ? t("recent.statusFailed")
        : t("recent.statusProcessing");

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-small font-medium text-foreground">{toolT("h1")}</p>
        <p className="truncate text-caption text-muted-foreground">
          {job.fileName} · {statusLabel} · {formatRelativeTime(new Date(job.createdAt), locale)}
        </p>
      </div>
      <Dropdown>
        <DropdownTrigger asChild>
          <IconButton label={t("fileActions.moreActions")} size="sm" variant="ghost">
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </DropdownTrigger>
        <DropdownContent align="end">
          {primaryOutput ? (
            <DropdownItem asChild>
              <a href={`/api/files/${primaryOutput.id}/download`}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("fileActions.download")}
              </a>
            </DropdownItem>
          ) : null}
          <DropdownItem onSelect={onHide}>
            <X className="h-4 w-4" aria-hidden="true" />
            {t("recent.hide")}
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </li>
  );
}
