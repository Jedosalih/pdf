"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/Alert";
import { FileUploader } from "@/components/tools/FileUploader";
import { ProcessingState } from "@/components/tools/ProcessingState";
import { ResultState } from "@/components/tools/ResultState";
import { StartOverButton } from "@/components/tools/StartOverButton";
import { useToolWorkflow, errorMessageKey } from "@/components/tools/useToolWorkflow";
import type { ProcessingStep } from "@/components/tools/ProcessingProgress";
import { usePdfDocument } from "./usePdfDocument";
import { useEditorState } from "./useEditorState";
import { EditorToolbar } from "./EditorToolbar";
import { EditorPageSidebar } from "./EditorPageSidebar";
import { EditorPropertiesPanel } from "./EditorPropertiesPanel";
import { EditorCanvas } from "./EditorCanvas";

const TOOL_ID = "edit-pdf";
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;

interface EditPdfToolProps {
  maxFiles: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("decode failed"));
    img.src = dataUrl;
  });
}

export function EditPdfTool({ maxFiles }: EditPdfToolProps) {
  const t = useTranslations("tool.edit-pdf");
  const tCommon = useTranslations("common");
  const tTools = useTranslations("tools");

  const {
    files,
    items,
    flow,
    errorCode,
    outputFiles,
    jobId,
    hasErrors,
    handleFilesSelected,
    handleRemove,
    start,
    reset,
  } = useToolWorkflow({ toolId: TOOL_ID, maxFiles });

  const file = files[0]?.file ?? null;
  const uploaded = files[0]?.status === "uploaded";
  const { pdfDoc } = usePdfDocument(file);

  const editor = useEditorState();
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  });

  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pendingColor, setPendingColor] = useState("#111827");
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Reset to page 0 whenever a new file replaces the previous one --
  // adjusted directly during render (React's recommended pattern for state
  // that mirrors a changing value) rather than via an effect.
  const [pageResetFor, setPageResetFor] = useState<File | null>(null);
  if (file !== pageResetFor) {
    setPageResetFor(file);
    setCurrentPage(0);
  }

  const selectedElement = editor.elements.find((el) => el.id === editor.selectedId) ?? null;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTextInput = target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";
      const ed = editorRef.current;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) ed.redo();
        else ed.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        ed.redo();
        return;
      }
      if (isTextInput) return;

      if ((event.key === "Delete" || event.key === "Backspace") && ed.selectedId) {
        event.preventDefault();
        ed.deleteSelected();
        return;
      }
      if (event.key === "Escape") {
        ed.selectElement(null);
        ed.setActiveTool("select");
        return;
      }
      if (
        ed.selectedId &&
        (event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight")
      ) {
        const current = ed.elements.find((el) => el.id === ed.selectedId);
        if (!current) return;
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        ed.updateElementCommitted(current.id, { x: current.x + dx, y: current.y + dy });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleAddImageClick = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  const handleImageFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0];
      event.target.value = "";
      if (!picked) return;
      try {
        const dataUrl = await readFileAsDataUrl(picked);
        const { width, height } = await measureImage(dataUrl);
        const defaultWidth = 200;
        const defaultHeight = width > 0 ? (height / width) * defaultWidth : 150;
        editor.addElement({
          id: crypto.randomUUID(),
          type: "image",
          page: currentPage,
          x: 72,
          y: 72,
          width: defaultWidth,
          height: defaultHeight,
          image: dataUrl,
        });
      } catch {
        // Malformed/unreadable image -- silently ignored, nothing was added.
      }
    },
    [currentPage, editor],
  );

  const canExport =
    editor.elements.length > 0 && uploaded && (flow === "selecting" || flow === "failed");

  const handleExport = useCallback(() => {
    void start({ edits: editor.elements as unknown as Record<string, unknown>[] });
  }, [editor.elements, start]);

  if (flow === "completed") {
    return (
      <ResultState
        title={tTools("result.title")}
        outputFiles={outputFiles}
        jobId={jobId}
        downloadLabel={tTools("result.download")}
      >
        <StartOverButton label={tTools("result.processAnother")} onClick={reset} />
      </ResultState>
    );
  }

  if (flow === "creating" || flow === "processing") {
    const steps: ProcessingStep[] = [
      { label: tTools("status.uploading"), state: "done" },
      { label: tTools("status.processing"), state: flow === "processing" ? "active" : "pending" },
    ];
    return (
      <ProcessingState
        title={flow === "creating" ? tTools("status.queued") : tTools("status.processing")}
        steps={steps}
      />
    );
  }

  if (!file || !uploaded) {
    return (
      <div className="flex flex-col gap-6">
        <FileUploader
          items={items}
          reorderable={false}
          accept="application/pdf"
          multiple={false}
          maxFiles={maxFiles}
          onFilesSelected={handleFilesSelected}
          onReorder={() => {}}
          onRemove={handleRemove}
          dropzoneLabel={tTools("upload.dropHere")}
          browseLabel={tTools("upload.orBrowse")}
          addMoreLabel={tTools("upload.orBrowse")}
        />
        {hasErrors ? <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => void handleImageFileSelected(event)}
      />

      <EditorToolbar
        activeTool={editor.activeTool}
        onToolChange={editor.setActiveTool}
        onAddImageClick={handleAddImageClick}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onUndo={editor.undo}
        onRedo={editor.redo}
        zoomPercent={Math.round(zoom * 100)}
        onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
        onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
        onExport={handleExport}
        exportDisabled={!canExport}
      />

      {flow === "failed" ? (
        <Alert variant="error">{tCommon(`errors.${errorMessageKey(errorCode)}`)}</Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <EditorPageSidebar file={file} currentPage={currentPage} onSelectPage={setCurrentPage} />

        <div className="flex-1 overflow-auto rounded-lg border border-border bg-surface p-6">
          <div className="flex justify-center">
            {pdfDoc ? (
              <EditorCanvas
                pdfDoc={pdfDoc}
                pageIndex={currentPage}
                zoom={zoom}
                activeTool={editor.activeTool}
                pendingColor={
                  selectedElement && "color" in selectedElement ? selectedElement.color : pendingColor
                }
                elements={editor.elements}
                selectedId={editor.selectedId}
                onSelect={editor.selectElement}
                onAddElement={editor.addElement}
                onUpdateLive={editor.updateElementLive}
                onUpdateCommitted={editor.updateElementCommitted}
                onDeleteElement={editor.deleteElement}
                onBeginDrag={editor.beginDrag}
                onEndDrag={editor.endDrag}
                onToolConsumed={() => editor.setActiveTool("select")}
              />
            ) : null}
          </div>
        </div>

        {selectedElement ? (
          <EditorPropertiesPanel
            element={selectedElement}
            onChange={(patch) => {
              editor.updateElementCommitted(selectedElement.id, patch);
              if ("color" in patch && typeof patch.color === "string") setPendingColor(patch.color);
            }}
            onDelete={() => editor.deleteElement(selectedElement.id)}
          />
        ) : null}
      </div>

      <p className="text-small text-muted-foreground">{t("editor.overlayNote")}</p>
    </div>
  );
}
