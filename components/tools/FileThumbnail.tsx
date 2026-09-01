import { FileText, Image as ImageIcon, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface FileThumbnailProps {
  mimeType: string;
  status: "uploading" | "uploaded" | "error";
  className?: string;
}

/**
 * Icon-based placeholder for now (fast, zero extra work per file). Tools
 * that need users to actually see/select pages (Delete/Extract/Reorder/
 * Rotate) upgrade this to a real pdf.js-rendered page thumbnail when built
 * — see docs/DECISIONS.md.
 */
export function FileThumbnail({ mimeType, status, className }: FileThumbnailProps) {
  const Icon = status === "error" ? FileWarning : mimeType.startsWith("image/") ? ImageIcon : FileText;

  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-sm",
        status === "error" ? "bg-error/10 text-error" : "bg-secondary text-secondary-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="h-5 w-5" />
    </div>
  );
}
