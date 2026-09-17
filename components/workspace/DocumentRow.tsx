"use client";

import { MoreVertical, Star, Trash2, RotateCcw, Pencil, Download, Wand } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { formatFileSize } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/routing";
import { FileThumbnail } from "@/components/tools/FileThumbnail";
import { IconButton } from "@/components/ui/IconButton";
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from "@/components/ui/Dropdown";
import type { FileView } from "@/lib/workspace/files";

export interface WorkspaceFileSummary {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  starred: boolean;
  createdAt: string;
}

interface DocumentRowProps {
  file: WorkspaceFileSummary;
  view: FileView;
  onStar: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onRename: () => void;
  onDeletePermanently: () => void;
  /** Omitted entirely (not just disabled) when no enabled tool accepts
   * this file's type, so the menu never offers an action that would
   * silently do nothing. */
  onUseInTool?: () => void;
}

export function DocumentRow({
  file,
  view,
  onStar,
  onTrash,
  onRestore,
  onRename,
  onDeletePermanently,
  onUseInTool,
}: DocumentRowProps) {
  const t = useTranslations("workspace.fileActions");
  const locale = useLocale() as Locale;

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
      <FileThumbnail mimeType={file.mimeType} status="uploaded" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small font-medium text-foreground">{file.originalName}</p>
        <p className="text-caption text-muted-foreground">{formatFileSize(file.size, locale)}</p>
      </div>
      {file.starred ? (
        <Star className="h-4 w-4 shrink-0 fill-warning text-warning" aria-hidden="true" />
      ) : null}
      <Dropdown>
        <DropdownTrigger asChild>
          <IconButton label={t("moreActions")} size="sm" variant="ghost">
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </DropdownTrigger>
        <DropdownContent align="end">
          {view !== "trash" ? (
            <>
              {onUseInTool ? (
                <DropdownItem onSelect={onUseInTool}>
                  <Wand className="h-4 w-4" aria-hidden="true" />
                  {t("useInTool")}
                </DropdownItem>
              ) : null}
              <DropdownItem onSelect={onRename}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                {t("rename")}
              </DropdownItem>
              <DropdownItem onSelect={onStar}>
                <Star className="h-4 w-4" aria-hidden="true" />
                {file.starred ? t("unstar") : t("star")}
              </DropdownItem>
              <DropdownItem asChild>
                <a href={`/api/files/${file.id}/download`}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t("download")}
                </a>
              </DropdownItem>
              <DropdownItem onSelect={onTrash}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t("moveToTrash")}
              </DropdownItem>
            </>
          ) : (
            <>
              <DropdownItem onSelect={onRestore}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t("restore")}
              </DropdownItem>
              <DropdownItem onSelect={onDeletePermanently}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t("deletePermanently")}
              </DropdownItem>
            </>
          )}
        </DropdownContent>
      </Dropdown>
    </li>
  );
}
