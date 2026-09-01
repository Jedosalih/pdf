import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { DownloadButton } from "./DownloadButton";
import type { JobOutputFile } from "./useToolWorkflow";

interface ResultStateProps {
  title: string;
  outputFiles: JobOutputFile[];
  downloadLabel: string;
  children?: ReactNode;
}

export function ResultState({ title, outputFiles, downloadLabel, children }: ResultStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-5 rounded-lg border border-border bg-background px-6 py-12 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="text-h3 font-semibold text-foreground">{title}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {outputFiles.map((file) => (
          <DownloadButton key={file.id} fileId={file.id} label={downloadLabel} />
        ))}
      </div>
      {children}
    </div>
  );
}
