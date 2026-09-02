"use client";

import { useEffect, useState } from "react";

export interface PdfPageThumbnail {
  /** 1-indexed, matching qpdf's page numbering. */
  pageNumber: number;
  dataUrl: string;
}

interface UsePdfPageThumbnailsResult {
  pages: PdfPageThumbnail[];
  loading: boolean;
  error: boolean;
}

const THUMBNAIL_WIDTH = 140;

/**
 * Renders every page of a locally-selected PDF to a small thumbnail
 * entirely in the browser via pdfjs-dist — no server round trip needed
 * just to show the user what's in their file. Shared by Delete/Extract/
 * Reorder Pages instead of each tool wiring up pdf.js itself.
 */
export function usePdfPageThumbnails(file: File | null): UsePdfPageThumbnailsResult {
  const [pages, setPages] = useState<PdfPageThumbnail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!file) {
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(false);
      setPages([]);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const results: PdfPageThumbnail[] = [];

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await doc.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = THUMBNAIL_WIDTH / baseViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext("2d");
          if (!context) continue;

          await page.render({ canvasContext: context, viewport, canvas }).promise;
          results.push({ pageNumber, dataUrl: canvas.toDataURL("image/png") });
        }

        if (!cancelled) setPages(results);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file) {
    return { pages: [], loading: false, error: false };
  }

  return { pages, loading, error };
}
