/**
 * All coordinates are in PDF points (1/72in) with a top-left origin,
 * matching the on-screen overlay -- converted to pdf-lib's bottom-left
 * origin only once, server-side, at export time (workers/pdf/src/handlers/
 * editPdf.ts). This keeps the model independent of the current zoom level.
 */
interface BaseElement {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
}

export interface ImageElement extends BaseElement {
  type: "image";
  image: string;
}

export interface RectElement extends BaseElement {
  type: "rect";
  color: string;
  opacity: number;
  fill: boolean;
  strokeWidth: number;
}

export interface HighlightElement extends BaseElement {
  type: "highlight";
  color: string;
}

export interface PathElement extends BaseElement {
  type: "path";
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

export type EditElement =
  | TextElement
  | ImageElement
  | RectElement
  | HighlightElement
  | PathElement;

export type EditorTool = "select" | "text" | "image" | "rect" | "highlight" | "draw";

export const PRESET_COLORS = [
  "#111827",
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#eab308",
  "#ffffff",
];
