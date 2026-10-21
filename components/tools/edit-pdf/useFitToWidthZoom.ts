"use client";

import { useEffect, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const ZOOM_STEP = 0.05;

/**
 * When a document loads, shrinks the initial zoom so page 1 fits the
 * canvas container's width (never enlarges past 100%). On a phone a
 * 600pt-wide page at 100% was cut off at the edge with no hint that it
 * scrolls sideways. The user can still zoom freely afterwards.
 */
export function useFitToWidthZoom(
  pdfDoc: PDFDocumentProxy | null,
  containerRef: RefObject<HTMLElement | null>,
  setZoom: (zoom: number) => void,
  minZoom: number,
) {
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    void (async () => {
      const page = await pdfDoc.getPage(1);
      const container = containerRef.current;
      if (cancelled || !container) return;
      const style = getComputedStyle(container);
      const available =
        container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const pageWidth = page.getViewport({ scale: 1 }).width;
      if (available <= 0 || pageWidth <= 0) return;
      const fit = Math.floor((available / pageWidth) / ZOOM_STEP) * ZOOM_STEP;
      setZoom(Math.min(1, Math.max(minZoom, fit)));
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, containerRef, setZoom, minZoom]);
}
