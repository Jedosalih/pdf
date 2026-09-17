-- DropIndex
DROP INDEX "UsageRecord_guestId_toolId_windowStart_idx";

-- DropIndex
DROP INDEX "UsageRecord_userId_toolId_windowStart_idx";

-- AlterTable
ALTER TABLE "File" DROP COLUMN "checksum",
DROP COLUMN "pageCount";

-- AlterTable
ALTER TABLE "UsageRecord" DROP COLUMN "count",
DROP COLUMN "windowStart";

-- CreateIndex
CREATE INDEX "UsageRecord_userId_toolId_createdAt_idx" ON "UsageRecord"("userId", "toolId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_guestId_toolId_createdAt_idx" ON "UsageRecord"("guestId", "toolId", "createdAt");
