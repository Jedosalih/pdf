"use client";

import { usePdfPageThumbnails } from "@/components/tools/usePdfPageThumbnails";

interface EditorPageSidebarProps {
  file: File;
  currentPage: number;
  onSelectPage: (pageIndex: number) => void;
}

export function EditorPageSidebar({ file, currentPage, onSelectPage }: EditorPageSidebarProps) {
  const { pages, loading } = usePdfPageThumbnails(file);

  return (
    <div className="hidden w-28 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-surface p-2 sm:flex">
      {loading && pages.length === 0 ? (
        <div className="text-center text-small text-muted-foreground">…</div>
      ) : null}
      {pages.map((page) => (
        <button
          key={page.pageNumber}
          type="button"
          data-testid="editor-page-thumb"
          onClick={() => onSelectPage(page.pageNumber - 1)}
          className={`overflow-hidden rounded-md border-2 transition-colors ${
            page.pageNumber - 1 === currentPage
              ? "border-primary"
              : "border-transparent hover:border-border"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- locally rendered canvas data: URL */}
          <img src={page.dataUrl} alt="" className="w-full" />
          <span className="block bg-background/80 py-0.5 text-center text-small text-muted-foreground">
            {page.pageNumber}
          </span>
        </button>
      ))}
    </div>
  );
}
