import { getTranslations } from "next-intl/server";

export async function Footer() {
  const t = await getTranslations("common");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-h3 font-bold text-foreground">{t("brand")}</p>
        <p className="mt-2 max-w-sm text-small text-muted-foreground">
          {t("footer.tagline")}
        </p>
        <p className="mt-8 text-caption text-muted-foreground">
          © {year} {t("brand")}. {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
