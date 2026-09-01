import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Inter, Cairo } from "next/font/google";
import { Direction } from "radix-ui";
import { routing, isRtl, type Locale } from "@/lib/i18n/routing";
import { AppHeader } from "@/components/layout/AppHeader";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
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
              <AppHeader />
              <main className="flex-1">{children}</main>
              <Footer />
              <Toaster />
            </TooltipProvider>
          </Direction.Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
