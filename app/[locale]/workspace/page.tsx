import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSessionUser } from "@/lib/auth/session";
import { listRecentJobs } from "@/lib/workspace/jobs";
import { getToolById } from "@/lib/tools/registry";
import { formatRelativeTime } from "@/lib/i18n/format";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { Link, redirect } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Greeting } from "@/components/workspace/Greeting";
import { QuickActions } from "@/components/workspace/QuickActions";
import { WorkspaceUploadButton } from "@/components/workspace/WorkspaceUploadButton";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workspace" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/workspace",
    title: t("nav.home"),
    description: t("greeting.subtitle"),
  });
}

export default async function WorkspaceHomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("workspace");

  // The layout redirects signed-out visitors too, but layouts and pages
  // render concurrently in the App Router -- the page can't assume the
  // layout's redirect already happened (it 500'd on an expired session).
  const user = await getSessionUser();
  if (!user) return redirect({ href: "/login", locale });
  const { items: recentJobs } = await listRecentJobs({ userId: user.id, limit: 5 });

  const jobRows = await Promise.all(
    recentJobs.map(async (job) => {
      const tool = getToolById(job.toolId);
      const toolT = tool ? await getTranslations({ locale, namespace: tool.translationNamespace }) : null;
      return {
        id: job.id,
        toolName: toolT ? toolT("h1") : job.toolId,
        fileName: job.inputFileNames[0] ?? job.outputFiles[0]?.name ?? "",
        status: job.status,
        createdAt: job.createdAt,
      };
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Greeting name={user.name} />
        <WorkspaceUploadButton label={t("recent.emptyCta")} />
      </div>

      <QuickActions />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-foreground">{t("recent.title")}</h2>
          {jobRows.length > 0 ? (
            <Link href="/workspace/recent" className="text-small font-medium text-primary hover:underline">
              {t("recent.viewAll")}
            </Link>
          ) : null}
        </div>

        {jobRows.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={t("recent.emptyTitle")}
            description={t("recent.emptyDescription")}
            action={
              <Link href="/">
                <Button size="sm">{t("recent.emptyCta")}</Button>
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {jobRows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-small font-medium text-foreground">{row.toolName}</p>
                  <p className="truncate text-caption text-muted-foreground">{row.fileName}</p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-caption font-medium text-muted-foreground">
                    {row.status === "COMPLETED"
                      ? t("recent.statusCompleted")
                      : row.status === "FAILED"
                        ? t("recent.statusFailed")
                        : t("recent.statusProcessing")}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {formatRelativeTime(row.createdAt, locale as Locale)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
