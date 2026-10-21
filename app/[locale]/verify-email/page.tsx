import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { Card, CardContent } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return {
    ...buildLocalizedMetadata({
      locale: locale as Locale,
      path: "/verify-email",
      title: t("verify.title"),
      description: t("verify.subtitle"),
    }),
    robots: { index: false, follow: false },
    // The URL carries a single-use token; never send it on as a Referer.
    referrer: "no-referrer",
  };
}

export default async function VerifyEmailPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";

  return (
    <PageContainer className="max-w-md">
      <Section>
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-h2 font-bold text-foreground">{t("verify.title")}</h1>
              <p className="mt-1 text-small text-muted-foreground">{t("verify.subtitle")}</p>
            </div>
            {token ? <VerifyEmailForm token={token} /> : <Alert variant="error">{t("verify.missingToken")}</Alert>}
          </CardContent>
        </Card>
      </Section>
    </PageContainer>
  );
}
