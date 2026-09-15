"use client";

import { Home, Wrench, FolderOpen, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils/cn";

/** Fixed bottom bar for small screens (blueprint §40) — replaces the
 * sidebar, which is hidden below `md`. */
export function MobileBottomNav() {
  const t = useTranslations("workspace");
  const pathname = usePathname();

  const items = [
    { href: "/workspace", label: t("mobileNav.home"), icon: Home, exact: true },
    { href: "/tools", label: t("mobileNav.tools"), icon: Wrench },
    { href: "/workspace/documents", label: t("mobileNav.files"), icon: FolderOpen },
    { href: "/workspace/settings", label: t("mobileNav.profile"), icon: User },
  ];

  return (
    <nav
      aria-label="Workspace"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/95 backdrop-blur md:hidden"
    >
      {items.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-caption font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
