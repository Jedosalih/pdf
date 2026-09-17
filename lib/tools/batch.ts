/**
 * Tools eligible for batch processing: apply the same single-file
 * operation to many files at once, each producing its own independent
 * result (as opposed to merge-pdf-style tools, which already combine many
 * inputs into one output and don't need this at all).
 *
 * Scoped to tools with no *required* option -- batch mode always uses
 * each tool's own sensible default, since collecting per-tool option UIs
 * generically would be a much larger, separate piece of work. Every entry
 * here is verified zero-required-option by reading its own tool component
 * before being added (see docs/DECISIONS.md).
 */
export const BATCHABLE_TOOL_IDS = [
  "compress-pdf",
  "flatten-pdf",
  "repair-pdf",
  "pdf-to-pdfa",
  "pdf-to-text",
] as const;

export type BatchableToolId = (typeof BATCHABLE_TOOL_IDS)[number];

/**
 * How many files a single batch can contain. Deliberately independent of
 * any tool's own `ToolLimits.maxFiles` -- that field caps how many files
 * go into *one job* (e.g. compress-pdf's own `maxFiles: 1`, since it only
 * ever takes one file per job), which is an entirely different axis from
 * "how many separate jobs can I fan out to at once" in batch mode. Reusing
 * the underlying tool's maxFiles here was a real bug caught by actually
 * running the feature: it silently capped every batch to 1 file.
 */
export const BATCH_MAX_FILES = 20;

/** The default options payload sent for each batchable tool's job --
 * matching the default each tool's own single-file UI already starts
 * with, not a new/different behavior. */
export const BATCH_DEFAULT_OPTIONS: Record<BatchableToolId, Record<string, unknown>> = {
  "compress-pdf": { level: "balanced" },
  "flatten-pdf": {},
  "repair-pdf": {},
  "pdf-to-pdfa": {},
  "pdf-to-text": {},
};
