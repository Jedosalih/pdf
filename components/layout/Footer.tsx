import { getTranslations } from "next-intl/server";
import { PageContainer } from "./PageContainer";

export async function Footer() {
  const t = await getTranslations("common");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <PageContainer className="flex flex-col gap-2 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-h3 font-bold text-foreground">{t("brand")}</p>
          <p className="mt-1 max-w-sm text-small text-muted-foreground">
            {t("footer.tagline")}
          </p>
        </div>
        <p className="text-caption text-muted-foreground">
          © {year} {t("brand")}. {t("footer.rights")}
        </p>
      </PageContainer>
    </footer>
  );
}
