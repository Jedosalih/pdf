"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { HistoryRow, type HistoryJobSummary } from "./HistoryRow";

export function HistoryList() {
  const t = useTranslations("workspace");
  const [items, setItems] = useState<HistoryJobSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/jobs?limit=50");
    if (response.ok) {
      const data = (await response.json()) as {
        items: {
          id: string;
          toolId: string;
          status: string;
          createdAt: string;
          inputFileNames: string[];
          outputFiles: { id: string; name: string; size: number }[];
        }[];
      };
      setItems(
        data.items.map((job) => ({
          id: job.id,
          toolId: job.toolId,
          fileName: job.inputFileNames[0] ?? job.outputFiles[0]?.name ?? "",
          status: job.status,
          createdAt: job.createdAt,
          outputFiles: job.outputFiles,
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred to a microtask (not called synchronously in the effect body)
    // to satisfy eslint-plugin-react-hooks's set-state-in-effect rule.
    void Promise.resolve().then(() => load());
  }, [load]);

  async function handleHide(jobId: string) {
    await fetch(`/api/jobs/${jobId}/hide`, { method: "POST" });
    void load();
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-13 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
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
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((job) => (
        <HistoryRow key={job.id} job={job} onHide={() => void handleHide(job.id)} />
      ))}
    </ul>
  );
}
