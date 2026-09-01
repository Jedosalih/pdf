import type { LucideIcon } from "lucide-react";

export type ToolCategory = "organize" | "convert" | "optimize" | "edit" | "security";

export type ToolProcessor =
  | "qpdf"
  | "ghostscript"
  | "poppler"
  | "ocrmypdf"
  | "libreoffice"
  | "pdf-lib"
  | "sharp";

export type ToolQueue =
  | "pdf-processing"
  | "ocr"
  | "office-conversion"
  | "image-processing";

export interface ToolLimits {
  /** Max size per input file, in bytes. */
  maxFileSizeBytes: number;
  /** Max number of input files in a single job. */
  maxFiles: number;
  /** Max total pages across all input files. */
  maxPages: number;
  /** Max successful operations per rolling 24h window. */
  dailyOperations: number;
}

export interface ToolDefinition {
  id: string;
  slug: string;
  category: ToolCategory;
  icon: LucideIcon;
  inputTypes: string[];
  outputType: string;
  processor: ToolProcessor;
  queue: ToolQueue;
  enabled: boolean;
  guestEnabled: boolean;
  /** Whether the dropzone should accept more than one file at a time. */
  multipleFiles: boolean;
  /** Key into messages/<locale>/index.ts, e.g. "tool.merge-pdf". */
  translationNamespace: string;
  relatedTools: string[];
  limits: {
    guest: ToolLimits;
    free: ToolLimits;
  };
}
