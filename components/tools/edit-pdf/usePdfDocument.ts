"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface UsePdfDocumentResult {
  pdfDoc: PDFDocumentProxy | null;
  numPages: number;
  loading: boolean;
  error: boolean;
}

/**
 * Loads a PDF once via pdfjs-dist and keeps the live document around so the
 * editor can render whichever page is current without re-parsing the file
 * on every page change -- same worker-path setup as usePdfPageThumbnails.ts,
 * but exposes the document itself instead of pre-rendered thumbnails.
 */
export function usePdfDocument(file: File | null): UsePdfDocumentResult {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(false);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
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
    return { pdfDoc: null, numPages: 0, loading: false, error: false };
  }
  return { pdfDoc, numPages, loading, error };
}
