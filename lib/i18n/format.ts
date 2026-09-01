import type { Locale } from "./routing";

const localeTags: Record<Locale, string> = {
  en: "en-US",
  ar: "ar-EG",
  tr: "tr-TR",
};

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTags[locale]).format(value);
}

export function formatDate(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(localeTags[locale], {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

export function formatFileSize(bytes: number, locale: Locale): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const formatted = new Intl.NumberFormat(localeTags[locale], {
    maximumFractionDigits: size < 10 ? 1 : 0,
  }).format(size);
  return `${formatted} ${units[unitIndex]}`;
}
