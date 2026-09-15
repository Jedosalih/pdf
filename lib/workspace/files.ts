import { prisma } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

export type FileView = "documents" | "starred" | "trash";
export type FileSort = "date" | "name" | "size";
export type SortOrder = "asc" | "desc";

export interface ListFilesParams {
  userId: string;
  view: FileView;
  q?: string;
  sort: FileSort;
  order: SortOrder;
  cursor?: string;
  limit: number;
}

export interface FileSummary {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  starred: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface ListFilesResult {
  items: FileSummary[];
  nextCursor: string | null;
}

const SORT_FIELD: Record<FileSort, "createdAt" | "originalName" | "size"> = {
  date: "createdAt",
  name: "originalName",
  size: "size",
};

/**
 * Cursor pagination (not offset) — the compound `orderBy` with `id` as a
 * tiebreaker keeps results stable even when sorting by non-unique columns
 * (name/size), and avoids the classic offset-shift bug when rows move
 * between views (star/trash) while a user is mid-scroll.
 */
export async function listFiles(params: ListFilesParams): Promise<ListFilesResult> {
  const { userId, view, q, sort, order, cursor, limit } = params;
  const field = SORT_FIELD[sort];

  const where: Prisma.FileWhereInput = {
    userId,
    deletedAt: view === "trash" ? { not: null } : null,
    ...(view === "starred" ? { starred: true } : {}),
    ...(q ? { originalName: { contains: q, mode: "insensitive" } } : {}),
  };

  const rows = await prisma.file.findMany({
    where,
    orderBy: [{ [field]: order }, { id: "asc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  return {
    items: items.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      starred: file.starred,
      deletedAt: file.deletedAt,
      createdAt: file.createdAt,
    })),
    nextCursor,
  };
}
