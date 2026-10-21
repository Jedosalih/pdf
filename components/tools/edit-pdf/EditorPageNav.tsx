"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/IconButton";

interface EditorPageNavProps {
  currentPage: number;
  numPages: number;
  onSelectPage: (pageIndex: number) => void;
}

/**
 * Page switching on phones, where EditorPageSidebar's thumbnails are
 * hidden (`sm:flex`) -- without this, only page 1 of a multi-page PDF
 * could be edited, redacted or signed on a small screen.
 */
export function EditorPageNav({ currentPage, numPages, onSelectPage }: EditorPageNavProps) {
  const t = useTranslations("common.pager");
  if (numPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 sm:hidden" data-testid="editor-page-nav">
      <IconButton
        label={t("previous")}
        disabled={currentPage === 0}
        onClick={() => onSelectPage(currentPage - 1)}
      >
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
      </IconButton>
      <span className="text-small text-muted-foreground" aria-live="polite">
        {t("pageOf", { current: currentPage + 1, total: numPages })}
      </span>
      <IconButton
        label={t("next")}
        disabled={currentPage >= numPages - 1}
        onClick={() => onSelectPage(currentPage + 1)}
      >
        <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
