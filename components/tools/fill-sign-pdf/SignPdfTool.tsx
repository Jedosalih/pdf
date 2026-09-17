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
import { usePdfDocument } from "@/components/tools/edit-pdf/usePdfDocument";
import { useEditorState } from "@/components/tools/edit-pdf/useEditorState";
import { EditorToolbar } from "@/components/tools/edit-pdf/EditorToolbar";
import { EditorPageSidebar } from "@/components/tools/edit-pdf/EditorPageSidebar";
import { EditorPropertiesPanel } from "@/components/tools/edit-pdf/EditorPropertiesPanel";
import { EditorCanvas } from "@/components/tools/edit-pdf/EditorCanvas";
import type { EditorTool } from "@/components/tools/edit-pdf/types";
import { useFormFields } from "./useFormFields";

const TOOL_ID = "fill-sign-pdf";
const NAMESPACE = "tool.fill-sign-pdf";
const TOOLS: EditorTool[] = ["select", "text", "draw"];
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const NUDGE_STEP = 1;
const NUDGE_STEP_LARGE = 10;

interface SignPdfToolProps {
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

export function SignPdfTool({ maxFiles }: SignPdfToolProps) {
  const t = useTranslations(NAMESPACE);
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
  const { pdfDoc, numPages } = usePdfDocument(file);
  const { fields } = useFormFields(pdfDoc, numPages);

  const editor = useEditorState();
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  });

  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pendingColor, setPendingColor] = useState("#111827");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [pageResetFor, setPageResetFor] = useState<File | null>(null);
  if (file !== pageResetFor) {
    setPageResetFor(file);
    setCurrentPage(0);
    setFieldValues({});
  }

  const selectedElement = editor.elements.find((el) => el.id === editor.selectedId) ?? null;
  const fieldsOnPage = fields.filter((field) => field.page === currentPage);

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
        const defaultWidth = 160;
        const defaultHeight = width > 0 ? (height / width) * defaultWidth : 80;
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

  const hasFieldInput = Object.keys(fieldValues).length > 0;
  const canExport =
    (hasFieldInput || editor.elements.length > 0) &&
    uploaded &&
    (flow === "selecting" || flow === "failed");

  const handleExport = useCallback(() => {
    void start({
      fields: fieldValues,
      edits: editor.elements as unknown as Record<string, unknown>[],
    });
  }, [fieldValues, editor.elements, start]);

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
        translationNamespace={NAMESPACE}
        tools={TOOLS}
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

      {fields.length > 0 ? (
        <Alert variant="info">{t("editor.fieldsDetected", { count: fields.length })}</Alert>
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
              >
                {fieldsOnPage.map((field) => (
                  <input
                    key={field.name}
                    data-testid="sign-form-field"
                    aria-label={field.name}
                    value={fieldValues[field.name] ?? field.defaultValue}
                    onChange={(event) =>
                      setFieldValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                    }
                    className="border-primary/50 bg-background focus:border-primary absolute rounded-sm border px-1 text-foreground outline-none"
                    style={{
                      left: field.x * zoom,
                      top: field.y * zoom,
                      width: field.width * zoom,
                      height: field.height * zoom,
                      fontSize: Math.max(10, field.height * zoom * 0.6),
                    }}
                  />
                ))}
              </EditorCanvas>
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
