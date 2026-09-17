"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Star, Trash2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { DocumentRow, type WorkspaceFileSummary } from "./DocumentRow";
import type { FileView, FileSort } from "@/lib/workspace/files";
import { usePendingUpload } from "@/components/upload/PendingUploadProvider";
import { getEnabledTools } from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";
import { ToolPickerModal } from "@/components/marketing/ToolPickerModal";

interface DocumentListProps {
  view: FileView;
}

const emptyStateIcon: Record<FileView, typeof FileText> = {
  documents: FileText,
  starred: Star,
  trash: Trash2,
};

export function DocumentList({ view }: DocumentListProps) {
  const t = useTranslations("workspace");
  const tCommon = useTranslations("common");

  const [items, setItems] = useState<WorkspaceFileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<FileSort>("date");
  const [renameTarget, setRenameTarget] = useState<WorkspaceFileSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceFileSummary | null>(null);
  const [toolPicker, setToolPicker] = useState<{ fileName: string; tools: ToolDefinition[] } | null>(
    null,
  );
  const pendingUpload = usePendingUpload();

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ view, sort, order: "desc" });
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(`/api/files?${params.toString()}`);
    if (response.ok) {
      const data = (await response.json()) as { items: WorkspaceFileSummary[] };
      setItems(data.items);
    }
    setLoading(false);
  }, [view, sort, query]);

  useEffect(() => {
    // Deferred to a microtask (not called synchronously in the effect body)
    // to satisfy eslint-plugin-react-hooks's set-state-in-effect rule.
    void Promise.resolve().then(() => load());
  }, [load]);

  async function handleStar(file: WorkspaceFileSummary) {
    await fetch(`/api/files/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: !file.starred }),
    });
    void load();
  }

  async function handleTrash(file: WorkspaceFileSummary) {
    await fetch(`/api/files/${file.id}/trash`, { method: "POST" });
    void load();
  }

  async function handleRestore(file: WorkspaceFileSummary) {
    await fetch(`/api/files/${file.id}/restore`, { method: "POST" });
    void load();
  }

  async function handleRenameSave() {
    if (!renameTarget || !renameValue.trim()) return;
    await fetch(`/api/files/${renameTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalName: renameValue.trim() }),
    });
    setRenameTarget(null);
    void load();
  }

  async function handleDeletePermanently() {
    if (!deleteTarget) return;
    await fetch(`/api/files/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    void load();
  }

  function handleUseInTool(file: WorkspaceFileSummary) {
    const matchingTools = getEnabledTools().filter((tool) =>
      tool.inputTypes.includes(file.mimeType),
    );
    if (matchingTools.length === 0) return;
    pendingUpload.setWorkspaceFile({
      id: file.id,
      name: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
    });
    setToolPicker({ fileName: file.originalName, tools: matchingTools });
  }

  const emptyTitle = t(`${view}.emptyTitle`);
  const emptyDescription = t(`${view}.emptyDescription`);
  const emptyCta = t(`${view}.emptyCta`);
  const emptyHref = view === "documents" ? "/" : "/workspace/documents";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("documents.searchPlaceholder")}
          aria-label={t("documents.searchPlaceholder")}
          trailing={<Search className="h-4 w-4" aria-hidden="true" />}
          className="sm:max-w-xs"
        />
        <Select
          value={sort}
          onValueChange={(value) => setSort(value as FileSort)}
          options={[
            { value: "date", label: t("documents.sortDate") },
            { value: "name", label: t("documents.sortName") },
            { value: "size", label: t("documents.sortSize") },
          ]}
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-15 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={emptyStateIcon[view]}
          title={emptyTitle}
          description={emptyDescription}
          action={
            <Link href={emptyHref}>
              <Button size="sm">{emptyCta}</Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((file) => (
            <DocumentRow
              key={file.id}
              file={file}
              view={view}
              onStar={() => void handleStar(file)}
              onTrash={() => void handleTrash(file)}
              onRestore={() => void handleRestore(file)}
              onRename={() => {
                setRenameTarget(file);
                setRenameValue(file.originalName);
              }}
              onDeletePermanently={() => setDeleteTarget(file)}
              onUseInTool={
                getEnabledTools().some((tool) => tool.inputTypes.includes(file.mimeType))
                  ? () => handleUseInTool(file)
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      <Modal
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title={t("renameDialog.title")}
        closeLabel={tCommon("nav.close")}
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t("renameDialog.label")}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>
              {t("renameDialog.cancel")}
            </Button>
            <Button onClick={() => void handleRenameSave()}>{t("renameDialog.save")}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("confirmDelete.title")}
        description={t("confirmDelete.description")}
        closeLabel={tCommon("nav.close")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            {t("confirmDelete.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void handleDeletePermanently()}>
            {t("confirmDelete.confirm")}
          </Button>
        </div>
      </Modal>

      {toolPicker ? (
        <ToolPickerModal
          fileName={toolPicker.fileName}
          tools={toolPicker.tools}
          onOpenChange={(open) => {
            if (!open) setToolPicker(null);
          }}
        />
      ) : null}
    </div>
  );
}
