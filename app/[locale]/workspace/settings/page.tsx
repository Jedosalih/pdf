import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "@/lib/i18n/navigation";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { SettingsForm } from "@/components/workspace/SettingsForm";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workspace" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/workspace/settings",
    title: t("settings.title"),
    description: t("settings.title"),
  });
}

export default async function SettingsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("workspace");
  // Layouts and pages render concurrently -- don't rely on the layout's
  // redirect having already happened (see workspace/page.tsx).
  const user = await getSessionUser();
  if (!user) return redirect({ href: "/login", locale });

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-h1 font-bold text-foreground">{t("settings.title")}</h1>
      <SettingsForm initialName={user.name ?? ""} email={user.email} />
    </div>
  );
}
