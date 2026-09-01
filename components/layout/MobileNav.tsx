"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { IconButton } from "@/components/ui/IconButton";
import { Drawer } from "@/components/ui/Drawer";
import { LocaleSwitcher } from "./LocaleSwitcher";
import type { NavItem } from "./DesktopNav";

interface MobileNavProps {
  items: readonly NavItem[];
}

export function MobileNav({ items }: MobileNavProps) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <IconButton label={t("nav.menu")} onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" aria-hidden="true" />
      </IconButton>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={t("brand")}
        closeLabel={t("nav.close")}
        side="end"
      >
        <nav aria-label="Main" className="flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-sm px-3 py-2.5 text-body font-medium text-foreground transition-colors hover:bg-surface"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4">
          <LocaleSwitcher />
        </div>
      </Drawer>
    </div>
  );
}
