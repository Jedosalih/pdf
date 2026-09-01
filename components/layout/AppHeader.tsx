import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { PageContainer } from "./PageContainer";
import { DesktopNav, type NavItem } from "./DesktopNav";
import { MobileNav } from "./MobileNav";
import { LocaleSwitcher } from "./LocaleSwitcher";

export async function AppHeader() {
  const t = await getTranslations("common");

  // Only link to routes that exist yet — Pricing/Blog/About/Contact join
  // this list once their pages ship (docs/DECISIONS.md).
  const navItems: readonly NavItem[] = [{ href: "/#tools", label: t("nav.pdfTools") }];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <PageContainer className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="text-h3 font-bold tracking-tight text-foreground">
          {t("brand")}
        </Link>

        <DesktopNav items={navItems} />

        <div className="flex items-center gap-1">
          <div className="hidden md:block">
            <LocaleSwitcher />
          </div>
          <MobileNav items={navItems} />
        </div>
      </PageContainer>
    </header>
  );
}
