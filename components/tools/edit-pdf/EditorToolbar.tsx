"use client";

import {
  MousePointer2,
  Type,
  ImagePlus,
  Highlighter,
  Square,
  Pencil,
  EyeOff,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import type { EditorTool } from "./types";

interface EditorToolbarProps {
  /** Which drawing tools this tool page exposes, in order -- edit-pdf
   * shows all five, fill-sign-pdf omits highlight/rect (not relevant to
   * signing a document). */
  tools?: EditorTool[];
  showImageButton?: boolean;
  /** Namespace to read `editor.tools.*`/`editor.export` from -- each
   * consumer tool has its own copy (e.g. fill-sign-pdf's "draw" tool is
   * labeled "Draw signature", not the generic "Freehand draw"). */
  translationNamespace: string;
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  onAddImageClick: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
  exportDisabled: boolean;
}

const TOOL_ICONS: Record<EditorTool, typeof MousePointer2> = {
  select: MousePointer2,
  text: Type,
  highlight: Highlighter,
  rect: Square,
  draw: Pencil,
  redact: EyeOff,
  image: ImagePlus,
};

const DEFAULT_TOOLS: EditorTool[] = ["select", "text", "highlight", "rect", "draw"];

export function EditorToolbar({
  tools = DEFAULT_TOOLS,
  showImageButton = true,
  translationNamespace,
  activeTool,
  onToolChange,
  onAddImageClick,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onExport,
  exportDisabled,
}: EditorToolbarProps) {
  const t = useTranslations(translationNamespace);
  const tCommon = useTranslations("common");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2">
      <div className="flex items-center gap-1">
        {tools.map((tool) => {
          const Icon = TOOL_ICONS[tool];
          return (
            <IconButton
              key={tool}
              label={t(`editor.tools.${tool}`)}
              aria-pressed={activeTool === tool}
              variant={activeTool === tool ? "secondary" : "ghost"}
              onClick={() => onToolChange(tool)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          );
        })}
        {showImageButton ? (
          <IconButton label={t("editor.tools.image")} variant="ghost" onClick={onAddImageClick}>
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>

      <div className="mx-1 h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        <IconButton label={tCommon("buttons.undo")} disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </IconButton>
        <IconButton label={tCommon("buttons.redo")} disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="mx-1 h-6 w-px bg-border" />

      <div className="flex items-center gap-1">
        <IconButton label={tCommon("buttons.zoomOut")} onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </IconButton>
        <span className="w-12 text-center text-small text-muted-foreground">{zoomPercent}%</span>
        <IconButton label={tCommon("buttons.zoomIn")} onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>

      <div className="ml-auto">
        <Button onClick={onExport} disabled={exportDisabled}>
          {t("editor.export")}
        </Button>
      </div>
    </div>
  );
}
