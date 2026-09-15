import { Combine, Minimize2, Scissors, Stamp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

const actions = [
  { slug: "merge-pdf", key: "merge", icon: Combine },
  { slug: "compress-pdf", key: "compress", icon: Minimize2 },
  { slug: "split-pdf", key: "split", icon: Scissors },
  { slug: "watermark-pdf", key: "watermark", icon: Stamp },
] as const;

/** Shortcuts into 4 of the 16 real tools — every slug here matches a
 * currently-shipped, enabled tool (no placeholder/aspirational actions). */
export async function QuickActions() {
  const t = await getTranslations("workspace");

  return (
    <div>
      <h2 className="mb-3 text-h3 font-semibold text-foreground">{t("quickActions.title")}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map(({ slug, key, icon: Icon }) => (
          <Link
            key={slug}
            href={`/${slug}`}
            className="flex flex-col items-start gap-2.5 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary/30 hover:bg-surface"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <span className="text-small font-medium text-foreground">
              {t(`quickActions.${key}`)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
