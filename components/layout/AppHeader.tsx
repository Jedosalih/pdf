import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { HeaderAuthSlot } from "@/components/auth/HeaderAuthSlot";
import { PageContainer } from "./PageContainer";
import { BrandMark } from "./BrandMark";
import { DesktopNav, type NavItem } from "./DesktopNav";
import { MobileNav } from "./MobileNav";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { SearchTrigger } from "./SearchTrigger";

export async function AppHeader() {
  const t = await getTranslations("common");

  const navItems: readonly NavItem[] = [
    { href: "/tools", label: t("nav.tools") },
    { href: "/workspace", label: t("nav.workspace") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <PageContainer className="flex h-16 items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-h3 font-bold tracking-tight text-foreground"
        >
          <BrandMark className="h-7 w-7" />
          {t("brand")}
        </Link>

        <DesktopNav items={navItems} />

        <div className="ms-auto flex items-center gap-1.5">
          <SearchTrigger />
          <div className="hidden md:block">
            <LocaleSwitcher />
          </div>
          <div className="hidden md:block">
            <HeaderAuthSlot />
          </div>
          <MobileNav items={navItems} authSlot={<HeaderAuthSlot />} />
        </div>
      </PageContainer>
    </header>
  );
}
