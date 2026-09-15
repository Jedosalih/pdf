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

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

/** "2 minutes ago" style strings for workspace/history rows — native
 * Intl.RelativeTimeFormat, zero dependency. */
export function formatRelativeTime(value: Date, locale: Locale): string {
  const diffMs = value.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(localeTags[locale], { numeric: "auto" });

  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return formatter.format(Math.round(diffMs / 1000), "second");
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
