"use client";

import { useState } from "react";
import { LogOut, LayoutGrid, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
} from "@/components/ui/Dropdown";
import type { SessionUser } from "@/lib/auth/session";

export function UserMenu({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const initial = (user.name?.trim()[0] ?? user.email[0])?.toUpperCase();

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={user.name ?? user.email}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-small font-semibold text-white transition-opacity hover:opacity-90"
        >
          {initial}
        </button>
      </DropdownTrigger>
      <DropdownContent align="end">
        <div className="px-2.5 py-2">
          <p className="truncate text-small font-medium text-foreground">
            {user.name ?? user.email}
          </p>
          {user.name ? (
            <p className="truncate text-caption text-muted-foreground">{user.email}</p>
          ) : null}
        </div>
        <DropdownSeparator />
        <DropdownItem onSelect={() => router.push("/workspace")}>
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          {t("common.nav.workspace")}
        </DropdownItem>
        <DropdownItem onSelect={() => router.push("/workspace/settings")}>
          <Settings className="h-4 w-4" aria-hidden="true" />
          {t("workspace.nav.settings")}
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem disabled={loggingOut} onSelect={handleLogout}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t("auth.logout")}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
