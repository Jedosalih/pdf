import { getTranslations } from "next-intl/server";
import { getStorageUsageBytes, SOFT_STORAGE_CAP_BYTES } from "@/lib/entitlements/storageUsage";
import { formatFileSize } from "@/lib/i18n/format";
import { Progress } from "@/components/ui/Progress";
import type { Locale } from "@/lib/i18n/routing";

/** Cosmetic only — a real computed sum against a soft display cap, not an
 * enforced quota (no billing tie-in, see docs/DECISIONS.md). */
export async function StorageUsageBar({ userId, locale }: { userId: string; locale: Locale }) {
  const t = await getTranslations("workspace.storage");
  const usedBytes = await getStorageUsageBytes(userId);
  const percent = (usedBytes / SOFT_STORAGE_CAP_BYTES) * 100;

  return (
    <div className="flex flex-col gap-1.5">
      <Progress value={percent} label={t("usedOfTotal", {
        used: formatFileSize(usedBytes, locale),
        total: formatFileSize(SOFT_STORAGE_CAP_BYTES, locale),
      })} />
      <p className="text-caption text-muted-foreground">
        {t("usedOfTotal", {
          used: formatFileSize(usedBytes, locale),
          total: formatFileSize(SOFT_STORAGE_CAP_BYTES, locale),
        })}
      </p>
    </div>
  );
}
