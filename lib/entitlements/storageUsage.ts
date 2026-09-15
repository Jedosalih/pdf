import { prisma } from "@/lib/db/client";

/** Cosmetic display cap only (ref.png's sidebar storage bar) — not enforced
 * anywhere, no upload is ever rejected because of it. No billing tie-in
 * (blueprint §35: don't implement billing until usage accounting is real). */
export const SOFT_STORAGE_CAP_BYTES = 10 * 1024 ** 3;

/** Single indexed aggregate query (uses the `File_userId_deletedAt_idx` index). */
export async function getStorageUsageBytes(userId: string): Promise<number> {
  const result = await prisma.file.aggregate({
    where: { userId, deletedAt: null },
    _sum: { size: true },
  });
  return result._sum.size ?? 0;
}
