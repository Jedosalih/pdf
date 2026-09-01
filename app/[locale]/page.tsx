import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { getEnabledTools } from "@/lib/tools/registry";
import { Card, CardContent } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "",
    title: t("hero.title"),
    description: t("hero.subtitle"),
  });
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  const tools = getEnabledTools();
  const toolCards = await Promise.all(
    tools.map(async (tool) => {
      const toolT = await getTranslations({
        locale,
        namespace: tool.translationNamespace,
      });
      return {
        slug: tool.slug,
        title: toolT("h1"),
        description: toolT("subtitle"),
      };
    }),
  );

  const whyUsItems = t.raw("whyUs.items") as { title: string; description: string }[];
  const steps = t.raw("howItWorks.steps") as string[];

  return (
    <div>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-20 text-center">
          <h1 className="text-display font-bold text-foreground">
            {t("hero.title")}
          </h1>
          <p className="max-w-2xl text-body text-muted-foreground">
            {t("hero.subtitle")}
          </p>
          <Link href="/#tools" className={buttonVariants({ size: "lg" })}>
            {t("hero.cta")}
          </Link>
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-h2 font-semibold text-foreground">
          {t("popularTools.title")}
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {toolCards.map((tool, index) => (
            <Reveal key={tool.slug} delayMs={index * 60}>
              <Link href={`/${tool.slug}`}>
                <Card className="h-full transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent>
                    <p className="text-h3 font-semibold text-foreground">
                      {tool.title}
                    </p>
                    <p className="mt-1 text-small text-muted-foreground">
                      {tool.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <Reveal>
          <h2 className="text-h2 font-semibold text-foreground">
            {t("whyUs.title")}
          </h2>
        </Reveal>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {whyUsItems.map((item, index) => (
            <Reveal key={item.title} delayMs={index * 80}>
              <div>
                <p className="text-h3 font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-small text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <Reveal>
          <h2 className="text-h2 font-semibold text-foreground">
            {t("howItWorks.title")}
          </h2>
        </Reveal>
        <ol className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map((step, index) => (
            <Reveal key={step} delayMs={index * 80}>
              <li className="flex flex-col gap-2">
                <span className="text-h2 font-bold text-primary">{index + 1}</span>
                <span className="text-body text-foreground">{step}</span>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>
    </div>
  );
}
