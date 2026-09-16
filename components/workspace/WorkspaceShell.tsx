import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { MobileBottomNav } from "./MobileBottomNav";

interface WorkspaceShellProps {
  children: ReactNode;
  /** Already-rendered server-side (StorageUsageBar does its own Prisma
   * read in the layout) — forwarded into the client sidebar as a prop. */
  storageUsage?: ReactNode;
}

export function WorkspaceShell({ children, storageUsage }: WorkspaceShellProps) {
  return (
    <PageContainer className="flex flex-col gap-8 py-6 pb-24 md:flex-row md:pb-10">
      <aside className="hidden md:block md:w-56 md:shrink-0">
        <WorkspaceSidebar storageUsage={storageUsage} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
      <MobileBottomNav />
    </PageContainer>
  );
}
