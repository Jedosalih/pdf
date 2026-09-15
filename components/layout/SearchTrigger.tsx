"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/IconButton";
import { useCommandPalette } from "./CommandPaletteProvider";

export function SearchTrigger() {
  const t = useTranslations("common");
  const { setOpen } = useCommandPalette();

  return (
    <IconButton
      label={t("nav.search")}
      size="sm"
      onClick={() => setOpen(true)}
    >
      <Search className="h-4 w-4" aria-hidden="true" />
    </IconButton>
  );
}
