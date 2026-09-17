"use client";

import { Trash2, Bold } from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/IconButton";
import { PRESET_COLORS, type EditElement } from "./types";

interface EditorPropertiesPanelProps {
  element: EditElement;
  onChange: (patch: Partial<EditElement>) => void;
  onDelete: () => void;
}

export function EditorPropertiesPanel({ element, onChange, onDelete }: EditorPropertiesPanelProps) {
  const t = useTranslations("tool.edit-pdf");
  const tCommon = useTranslations("common");
  const hasColor = element.type !== "image";

  return (
    <div className="flex w-full flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:w-56 sm:shrink-0">
      <h3 className="text-small font-semibold text-foreground">{t("editor.properties.title")}</h3>

      {hasColor ? (
        <div>
          <p className="mb-2 text-small text-muted-foreground">{t("editor.properties.color")}</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => onChange({ color })}
                className={`h-6 w-6 rounded-full border-2 ${
                  element.color === color ? "border-primary" : "border-border"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {element.type === "text" ? (
        <>
          <div>
            <label className="mb-2 block text-small text-muted-foreground" htmlFor="edit-pdf-font-size">
              {t("editor.properties.fontSize")}
            </label>
            <input
              id="edit-pdf-font-size"
              type="number"
              min={4}
              max={200}
              value={Math.round(element.fontSize)}
              onChange={(event) => onChange({ fontSize: Number(event.target.value) || element.fontSize })}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-body"
            />
          </div>
          <IconButton
            label={t("editor.properties.bold")}
            variant={element.bold ? "secondary" : "ghost"}
            aria-pressed={element.bold}
            onClick={() => onChange({ bold: !element.bold })}
          >
            <Bold className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </>
      ) : null}

      {element.type === "rect" ? (
        <button
          type="button"
          onClick={() => onChange({ fill: !element.fill })}
          className="rounded-md border border-border px-3 py-1.5 text-left text-small text-foreground hover:bg-background"
        >
          {element.fill ? t("editor.properties.outlineOnly") : t("editor.properties.fillShape")}
        </button>
      ) : null}

      <IconButton
        label={tCommon("buttons.delete")}
        variant="destructive"
        onClick={onDelete}
        className="ml-auto"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
