"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/Alert";
import { ToolDropzone } from "@/components/tools/ToolDropzone";
import { usePendingUpload } from "@/components/upload/PendingUploadProvider";
import { getEnabledTools } from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";
import { ToolPickerModal } from "./ToolPickerModal";

// Scoped honestly to what the 16 real tools actually accept today — not
// the DOCX/XLSX/PPTX list a generic "document workspace" mockup might
// suggest, since no tool handles those formats yet.
const ACCEPTED_TYPES = "application/pdf,image/jpeg,image/png";

export function HeroDropzoneCard() {
  const t = useTranslations("home");
  const pendingUpload = usePendingUpload();
  const [picker, setPicker] = useState<{ fileName: string; tools: ToolDefinition[] } | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  function handleFilesSelected(files: File[]) {
    const file = files[0];
    if (!file) return;
    setUnsupported(false);

    const matchingTools = getEnabledTools().filter((tool) =>
      tool.inputTypes.includes(file.type),
    );
    if (matchingTools.length === 0) {
      setUnsupported(true);
      return;
    }

    pendingUpload.setFile(file);
    setPicker({ fileName: file.name, tools: matchingTools });
  }

  return (
    <div className="flex flex-col gap-3">
      <ToolDropzone
        accept={ACCEPTED_TYPES}
        multiple={false}
        onFilesSelected={handleFilesSelected}
        onRejectedFiles={() => setUnsupported(true)}
        label={t("dropzone.title")}
        hint={t("dropzone.hint")}
        browseLabel={t("dropzone.browse")}
      />
      {unsupported ? <Alert variant="warning">{t("dropzone.unsupportedType")}</Alert> : null}
      {picker ? (
        <ToolPickerModal
          fileName={picker.fileName}
          tools={picker.tools}
          onOpenChange={(open) => {
            if (!open) setPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}
