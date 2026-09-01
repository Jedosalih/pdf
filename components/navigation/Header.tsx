import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export async function Header() {
  const t = await getTranslations("common");

  // Only link to routes that exist. Pricing/Blog/About/Contact are added to
  // this list once their pages ship — see docs/DECISIONS.md.
  const navItems = [{ href: "/#tools", label: t("nav.pdfTools") }] as const;

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="text-h3 font-bold text-foreground">
          {t("brand")}
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center gap-6 text-small font-medium text-muted-foreground md:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <LocaleSwitcher />
      </div>
    </header>
  );
}
