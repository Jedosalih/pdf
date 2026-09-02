import type { ReactNode } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { useLocale } from "next-intl";
import { formatFileSize } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/routing";
import { DownloadButton } from "./DownloadButton";
import type { JobOutputFile } from "./useToolWorkflow";

interface ResultStateProps {
  title: string;
  outputFiles: JobOutputFile[];
  downloadLabel: string;
  children?: ReactNode;
}

export function ResultState({ title, outputFiles, downloadLabel, children }: ResultStateProps) {
  const locale = useLocale() as Locale;

  return (
    <div
      role="status"
      className="flex flex-col items-center gap-5 rounded-lg border border-border bg-background px-6 py-12 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="text-h3 font-semibold text-foreground">{title}</p>

      {outputFiles.length <= 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {outputFiles.map((file) => (
            <DownloadButton key={file.id} fileId={file.id} label={downloadLabel} />
          ))}
        </div>
      ) : (
        <ul className="flex w-full max-w-sm flex-col gap-2 text-start">
          {outputFiles.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-small font-medium text-foreground">
                  {file.name}
                </p>
                <p className="text-caption text-muted-foreground">
                  {formatFileSize(file.size, locale)}
                </p>
              </div>
              <a
                href={`/api/files/${file.id}/download`}
                aria-label={`${downloadLabel} ${file.name}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-primary transition-colors hover:bg-secondary"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {children}
    </div>
  );
}
