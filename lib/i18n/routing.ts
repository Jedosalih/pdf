import { defineRouting } from "next-intl/routing";

export const locales = ["en", "ar", "tr"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const rtlLocales: readonly Locale[] = ["ar"];

export function isRtl(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
});
