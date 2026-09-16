"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import { Modal } from "@/components/ui/Modal";
import type { ToolDefinition } from "@/lib/tools/types";

function ToolPickerRow({ tool, onSelect }: { tool: ToolDefinition; onSelect: () => void }) {
  // Each row resolves its own tool's translation namespace — called here (a
  // proper component), not precomputed in a loop, since a dynamic namespace
  // argument to useTranslations is only valid inside a real component body.
  const t = useTranslations(tool.translationNamespace);
  const Icon = tool.icon;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-md p-2.5 text-start transition-colors hover:bg-surface"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-small font-medium text-foreground">
            {t("h1")}
          </span>
          <span className="block truncate text-caption text-muted-foreground">
            {t("subtitle")}
          </span>
        </span>
      </button>
    </li>
  );
}

interface ToolPickerModalProps {
  fileName: string;
  tools: ToolDefinition[];
  onOpenChange: (open: boolean) => void;
}

/**
 * "What do you want to do with this file?" — shown once the homepage's
 * hero dropzone receives a file whose type matches at least one real tool.
 * Always shown even for a single match, for predictability (no silent
 * auto-navigation).
 */
export function ToolPickerModal({ fileName, tools, onOpenChange }: ToolPickerModalProps) {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const router = useRouter();

  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title={t("picker.title", { fileName })}
      closeLabel={tCommon("nav.close")}
    >
      <ul className="flex flex-col gap-0.5">
        {tools.map((tool) => (
          <ToolPickerRow
            key={tool.slug}
            tool={tool}
            onSelect={() => router.push(`/${tool.slug}`)}
          />
        ))}
      </ul>
    </Modal>
  );
}
