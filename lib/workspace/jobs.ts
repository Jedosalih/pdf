import { prisma } from "@/lib/db/client";

export interface RecentJobSummary {
  id: string;
  toolId: string;
  status: string;
  createdAt: Date;
  errorCode: string | null;
  inputFileNames: string[];
  outputFiles: { id: string; name: string; size: number }[];
}

export interface ListRecentJobsResult {
  items: RecentJobSummary[];
  nextCursor: string | null;
}

/**
 * Tool display names are NOT joined from `ToolTranslation` here — only
 * `merge-pdf` has seeded translation rows (confirmed in `prisma/seed.ts`);
 * every tool's `h1` is already fully translated client-side via
 * `messages/<locale>/tool.<id>.json`, so callers render the name there
 * instead of duplicating translation data server-side.
 */
export async function listRecentJobs(params: {
  userId: string;
  cursor?: string;
  limit: number;
}): Promise<ListRecentJobsResult> {
  const { userId, cursor, limit } = params;

  const rows = await prisma.job.findMany({
    where: { userId, hiddenAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
    include: { inputFiles: true, outputFiles: true },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  return {
    items: items.map((job) => ({
      id: job.id,
      toolId: job.toolId,
      status: job.status,
      createdAt: job.createdAt,
      errorCode: job.errorCode,
      inputFileNames: job.inputFiles.map((file) => file.originalName),
      outputFiles: job.outputFiles.map((file) => ({
        id: file.id,
        name: file.originalName,
        size: file.size,
      })),
    })),
    nextCursor,
  };
}
