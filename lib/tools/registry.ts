import { Combine, Scissors, Minimize2, RotateCw } from "lucide-react";
import type { ToolDefinition } from "./types";

const MB = 1024 * 1024;

/**
 * Tools are only added here once their full pipeline (worker handler, page,
 * translations, E2E test) actually works end to end — an entry in this
 * registry is a promise the homepage/nav will link to something real, not
 * a placeholder (blueprint: "never ship a fake implementation").
 */
export const tools: ToolDefinition[] = [
  {
    id: "merge-pdf",
    slug: "merge-pdf",
    category: "organize",
    icon: Combine,
    inputTypes: ["application/pdf"],
    outputType: "application/pdf",
    processor: "qpdf",
    queue: "pdf-processing",
    enabled: true,
    guestEnabled: true,
    multipleFiles: true,
    translationNamespace: "tool.merge-pdf",
    relatedTools: ["split-pdf", "compress-pdf"],
    limits: {
      guest: {
        maxFileSizeBytes: 20 * MB,
        maxFiles: 10,
        maxPages: 300,
        dailyOperations: 8,
      },
      free: {
        maxFileSizeBytes: 50 * MB,
        maxFiles: 20,
        maxPages: 1000,
        dailyOperations: 30,
      },
    },
  },
  {
    id: "split-pdf",
    slug: "split-pdf",
    category: "organize",
    icon: Scissors,
    inputTypes: ["application/pdf"],
    outputType: "application/pdf",
    processor: "qpdf",
    queue: "pdf-processing",
    enabled: true,
    guestEnabled: true,
    multipleFiles: false,
    translationNamespace: "tool.split-pdf",
    relatedTools: ["merge-pdf", "compress-pdf"],
    limits: {
      guest: {
        maxFileSizeBytes: 20 * MB,
        maxFiles: 1,
        maxPages: 300,
        dailyOperations: 8,
      },
      free: {
        maxFileSizeBytes: 50 * MB,
        maxFiles: 1,
        maxPages: 1000,
        dailyOperations: 30,
      },
    },
  },
  {
    id: "compress-pdf",
    slug: "compress-pdf",
    category: "optimize",
    icon: Minimize2,
    inputTypes: ["application/pdf"],
    outputType: "application/pdf",
    processor: "ghostscript",
    queue: "pdf-processing",
    enabled: true,
    guestEnabled: true,
    multipleFiles: false,
    translationNamespace: "tool.compress-pdf",
    relatedTools: ["merge-pdf", "split-pdf"],
    limits: {
      guest: {
        maxFileSizeBytes: 20 * MB,
        maxFiles: 1,
        maxPages: 300,
        dailyOperations: 8,
      },
      free: {
        maxFileSizeBytes: 50 * MB,
        maxFiles: 1,
        maxPages: 1000,
        dailyOperations: 30,
      },
    },
  },
  {
    id: "rotate-pdf",
    slug: "rotate-pdf",
    category: "organize",
    icon: RotateCw,
    inputTypes: ["application/pdf"],
    outputType: "application/pdf",
    processor: "qpdf",
    queue: "pdf-processing",
    enabled: true,
    guestEnabled: true,
    multipleFiles: false,
    translationNamespace: "tool.rotate-pdf",
    relatedTools: ["merge-pdf", "split-pdf"],
    limits: {
      guest: {
        maxFileSizeBytes: 20 * MB,
        maxFiles: 1,
        maxPages: 300,
        dailyOperations: 8,
      },
      free: {
        maxFileSizeBytes: 50 * MB,
        maxFiles: 1,
        maxPages: 1000,
        dailyOperations: 30,
      },
    },
  },
];

export function getEnabledTools(): ToolDefinition[] {
  return tools.filter((tool) => tool.enabled);
}

export function getToolsByCategory(category: ToolDefinition["category"]): ToolDefinition[] {
  return getEnabledTools().filter((tool) => tool.category === category);
}

export function getToolBySlug(slug: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.slug === slug && tool.enabled);
}

export function getToolById(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.id === id);
}
