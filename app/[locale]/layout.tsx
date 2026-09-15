import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Inter, Cairo } from "next/font/google";
import { Direction } from "radix-ui";
import { getTranslations } from "next-intl/server";
import { routing, isRtl, type Locale } from "@/lib/i18n/routing";
import { getEnabledTools } from "@/lib/tools/registry";
import { AppHeader } from "@/components/layout/AppHeader";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { PendingUploadProvider } from "@/components/upload/PendingUploadProvider";
import { CommandPaletteProvider } from "@/components/layout/CommandPaletteProvider";
import {
  GlobalCommandPalette,
  type CommandPaletteToolItem,
} from "@/components/layout/GlobalCommandPalette";
import "../globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = isRtl(locale as Locale) ? "rtl" : "ltr";
  const fontClassName = locale === "ar" ? cairo.className : inter.className;

  const toolItems: CommandPaletteToolItem[] = await Promise.all(
    getEnabledTools().map(async (tool) => {
      const t = await getTranslations({ locale, namespace: tool.translationNamespace });
      const Icon = tool.icon;
      return {
        slug: tool.slug,
        title: t("h1"),
        description: t("subtitle"),
        category: tool.category,
        // Rendered here (a Server Component) rather than passed as a bare
        // component reference — a function/component reference can't cross
        // the Server->Client prop boundary into GlobalCommandPalette, only
        // an already-rendered element can.
        icon: <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />,
      };
    }),
  );

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${cairo.variable}`}
    >
      <body className={`${fontClassName} flex min-h-screen flex-col antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Direction.Provider dir={dir}>
            <TooltipProvider>
              <PendingUploadProvider>
                <CommandPaletteProvider>
                  <AppHeader />
                  <main className="flex-1">{children}</main>
                  <Footer />
                  <Toaster />
                  <GlobalCommandPalette toolItems={toolItems} />
                </CommandPaletteProvider>
              </PendingUploadProvider>
            </TooltipProvider>
          </Direction.Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
