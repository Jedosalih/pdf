"use client";

import type { ReactNode } from "react";
import { Home, FileText, Clock, Star, Trash2, Wrench, LayoutGrid, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils/cn";
import { useCommandPalette } from "@/components/layout/CommandPaletteProvider";

interface WorkspaceSidebarProps {
  /** Already-rendered server-side (StorageUsageBar does its own Prisma
   * read) — passed down from WorkspaceShell rather than fetched here. */
  storageUsage?: ReactNode;
}

export function WorkspaceSidebar({ storageUsage }: WorkspaceSidebarProps) {
  const t = useTranslations("workspace");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const { setOpen } = useCommandPalette();

  const sections = [
    {
      items: [
        { href: "/workspace", label: t("nav.home"), icon: Home, exact: true },
        { href: "/workspace/documents", label: t("nav.documents"), icon: FileText },
        { href: "/workspace/recent", label: t("nav.recent"), icon: Clock },
        { href: "/workspace/starred", label: t("nav.starred"), icon: Star },
        { href: "/workspace/trash", label: t("nav.trash"), icon: Trash2 },
      ],
    },
    {
      items: [
        { href: "/tools", label: t("nav.allTools"), icon: Wrench },
        { href: "/tools", label: t("nav.categories"), icon: LayoutGrid },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-start text-small text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{tCommon("commandPalette.placeholder")}</span>
      </button>

      <nav aria-label="Workspace" className="flex flex-col gap-6">
        {sections.map((section, index) => (
          <div key={index} className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-small font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-primary"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {storageUsage ? <div className="border-t border-border pt-4">{storageUsage}</div> : null}
    </div>
  );
}
