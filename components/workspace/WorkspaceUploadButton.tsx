"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { HeroDropzoneCard } from "@/components/marketing/HeroDropzoneCard";

/**
 * Persistent upload entry point for the workspace Home page — unlike the
 * homepage's hero dropzone, this stays visible next to the greeting at all
 * times, not just in the empty state. Reuses HeroDropzoneCard as-is (same
 * drop -> tool picker -> handoff flow), just triggered from inside the
 * workspace instead of only from the public homepage.
 */
export function WorkspaceUploadButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const tCommon = useTranslations("common");

  return (
    <>
      <Button size="sm" leadingIcon={<Upload className="h-4 w-4" aria-hidden="true" />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={label} closeLabel={tCommon("nav.close")}>
        <HeroDropzoneCard />
      </Modal>
    </>
  );
}
