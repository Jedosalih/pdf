import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "@/lib/i18n/navigation";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { PageContainer } from "@/components/layout/PageContainer";
import { Section } from "@/components/layout/Section";
import { Card, CardContent } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import { SignupForm } from "@/components/auth/SignupForm";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/signup",
    title: t("signup.title"),
    description: t("signup.subtitle"),
  });
}

export default async function SignupPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getSessionUser();
  if (user) {
    redirect({ href: "/workspace", locale });
  }

  const t = await getTranslations("auth");

  return (
    <PageContainer className="max-w-md">
      <Section>
        <Card>
          <CardContent className="flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-h2 font-bold text-foreground">{t("signup.title")}</h1>
              <p className="mt-1 text-small text-muted-foreground">{t("signup.subtitle")}</p>
            </div>
            <SignupForm />
            <p className="text-center text-small text-muted-foreground">
              {t("signup.haveAccount")}{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                {t("signup.logInLink")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </Section>
    </PageContainer>
  );
}
