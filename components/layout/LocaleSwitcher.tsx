"use client";

import { Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { locales, type Locale } from "@/lib/i18n/routing";
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from "@/components/ui/Dropdown";

const localeLabels: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  tr: "Türkçe",
};

export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={localeLabels[locale]}
          className="inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-small font-medium text-foreground transition-colors hover:bg-surface"
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{localeLabels[locale]}</span>
        </button>
      </DropdownTrigger>
      <DropdownContent align="end">
        {locales.map((code) => (
          <DropdownItem
            key={code}
            onSelect={() => router.replace(pathname, { locale: code })}
            aria-current={code === locale || undefined}
            className={code === locale ? "font-semibold text-primary" : undefined}
          >
            {localeLabels[code]}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
