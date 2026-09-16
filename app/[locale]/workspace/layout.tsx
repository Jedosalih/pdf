import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "@/lib/i18n/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { StorageUsageBar } from "@/components/workspace/StorageUsageBar";
import type { Locale } from "@/lib/i18n/routing";

interface WorkspaceLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Route protection for the whole `/workspace` subtree, done here rather
 * than in `proxy.ts` — `proxy.ts`'s matcher runs on every page site-wide,
 * so a Postgres round-trip there would tax the homepage and all 16 tool
 * pages for a check only this subtree needs (see docs/DECISIONS.md).
 */
export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { locale } = await params;
  const user = await getSessionUser();
  if (!user) {
    redirect({ href: "/login", locale });
  }

  return (
    <WorkspaceShell
      storageUsage={<StorageUsageBar userId={user!.id} locale={locale as Locale} />}
    >
      {children}
    </WorkspaceShell>
  );
}
