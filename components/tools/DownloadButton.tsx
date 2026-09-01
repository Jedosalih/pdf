import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";

interface DownloadButtonProps {
  fileId: string;
  label: string;
}

/** A real `<a href>` — not a JS onClick navigation — so the browser's
 * native "save as" / "open in new tab" / long-press-to-save all keep
 * working. */
export function DownloadButton({ fileId, label }: DownloadButtonProps) {
  return (
    <a
      href={`/api/files/${fileId}/download`}
      className={buttonVariants({ size: "lg", className: "gap-2" })}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
    </a>
  );
}
