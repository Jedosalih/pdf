"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export interface DetectedFormField {
  page: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  defaultValue: string;
}

interface RawAnnotation {
  subtype?: string;
  fieldType?: string;
  fieldName?: string;
  fieldValue?: unknown;
  hidden?: boolean;
  readOnly?: boolean;
  rect?: [number, number, number, number];
}

/**
 * Detects real AcroForm text fields via pdfjs-dist's own annotation data
 * (verified empirically against docs/fixtures/sample-with-form-field.pdf
 * before writing this -- `subtype: "Widget"` + `fieldType: "Tx"`, `rect`
 * in PDF bottom-left-origin space). Checkboxes/radio/dropdown fields
 * (`fieldType: "Btn"`/`"Ch"`) are deliberately out of scope for this first
 * pass -- see docs/DECISIONS.md.
 */
export function useFormFields(
  pdfDoc: PDFDocumentProxy | null,
  numPages: number,
): { fields: DetectedFormField[]; loading: boolean } {
  const [fields, setFields] = useState<DetectedFormField[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pdfDoc || numPages === 0) {
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const results: DetectedFormField[] = [];
      for (let pageIndex = 0; pageIndex < numPages; pageIndex += 1) {
        if (cancelled) return;
        const page = await pdfDoc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: 1 });
        const annotations = (await page.getAnnotations()) as RawAnnotation[];
        for (const annot of annotations) {
          if (
            annot.subtype !== "Widget" ||
            annot.fieldType !== "Tx" ||
            annot.hidden ||
            annot.readOnly ||
            !annot.fieldName ||
            !annot.rect
          ) {
            continue;
          }
          const [x1, y1, x2, y2] = annot.rect;
          results.push({
            page: pageIndex,
            name: annot.fieldName,
            x: x1,
            y: viewport.height - y2,
            width: x2 - x1,
            height: y2 - y1,
            defaultValue: typeof annot.fieldValue === "string" ? annot.fieldValue : "",
          });
        }
      }
      if (!cancelled) {
        setFields(results);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, numPages]);

  if (!pdfDoc || numPages === 0) {
    return { fields: [], loading: false };
  }
  return { fields, loading };
}
