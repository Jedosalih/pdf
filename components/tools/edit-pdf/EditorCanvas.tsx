"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { EditElement, EditorTool, PathElement } from "./types";

interface EditorCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageIndex: number;
  zoom: number;
  activeTool: EditorTool;
  pendingColor: string;
  elements: EditElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddElement: (element: EditElement) => void;
  onUpdateLive: (id: string, patch: Partial<EditElement>) => void;
  onUpdateCommitted: (id: string, patch: Partial<EditElement>) => void;
  onDeleteElement: (id: string) => void;
  onBeginDrag: () => void;
  onEndDrag: () => void;
  onToolConsumed: () => void;
  /** Extra content positioned over the same page-sized, zoom-scaled
   * container as the edit overlay -- used by fill-sign-pdf to render real
   * AcroForm text-field inputs above the (unrelated) annotation layer. */
  children?: ReactNode;
}

const DEFAULT_TEXT_WIDTH = 200;
const DEFAULT_TEXT_HEIGHT = 30;
const DEFAULT_SHAPE_SIZE = 120;
const MIN_DRAG_SIZE = 4;
const MIN_ELEMENT_SIZE = 10;

type Gesture =
  | {
      kind: "move";
      id: string;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
      originPoints?: { x: number; y: number }[];
    }
  | { kind: "resize"; id: string; startX: number; startY: number; originWidth: number; originHeight: number }
  | { kind: "draw-rect"; startX: number; startY: number }
  | { kind: "draw-path" };

export function EditorCanvas({
  pdfDoc,
  pageIndex,
  zoom,
  activeTool,
  pendingColor,
  elements,
  selectedId,
  onSelect,
  onAddElement,
  onUpdateLive,
  onUpdateCommitted,
  onDeleteElement,
  onBeginDrag,
  onEndDrag,
  onToolConsumed,
  children,
}: EditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [drawingRect, setDrawingRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[] | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      // Sized before rendering, so a render cancelled by a quick zoom or
      // page change can't leave the editor collapsed to zero height.
      const baseViewport = page.getViewport({ scale: 1 });
      setPageSize({ width: baseViewport.width, height: baseViewport.height });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      task = page.render({ canvasContext: context, viewport, canvas });
      try {
        await task.promise;
      } catch (error) {
        // Expected when a newer zoom/page superseded this render.
        if ((error as { name?: string })?.name !== "RenderingCancelledException") throw error;
      }
    })();
    return () => {
      cancelled = true;
      // pdf.js refuses a second render on a canvas that is still being
      // drawn ("Cannot use the same canvas during multiple render()
      // operations"); cancelling frees it synchronously.
      task?.cancel();
    };
  }, [pdfDoc, pageIndex, zoom]);

  const toPagePoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = overlayRef.current!.getBoundingClientRect();
      return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
    },
    [zoom],
  );

  const pageElements = elements.filter((el) => el.page === pageIndex);

  const beginTextEdit = useCallback((el: EditElement) => {
    if (el.type !== "text") return;
    setEditingId(el.id);
    setDraft(el.text);
  }, []);

  const commitTextEdit = useCallback(() => {
    if (!editingId) return;
    const value = draft;
    const id = editingId;
    setEditingId(null);
    if (!value.trim()) {
      onDeleteElement(id);
      return;
    }
    onUpdateCommitted(id, { text: value });
  }, [editingId, draft, onUpdateCommitted, onDeleteElement]);

  const handleOverlayPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (editingId) return;
      if (event.target !== event.currentTarget) return;
      // The overlay itself is never a focus target -- without this, the
      // browser's own default mousedown focus-handling (blur-since-target-
      // isn't-focusable) can run *after* React mounts a new text element's
      // autoFocus textarea, immediately stealing focus back and firing its
      // blur handler (which discards the just-created empty text box).
      event.preventDefault();
      const point = toPagePoint(event.clientX, event.clientY);

      if (activeTool === "select") {
        onSelect(null);
        return;
      }

      if (activeTool === "text") {
        const id = crypto.randomUUID();
        onAddElement({
          id,
          type: "text",
          page: pageIndex,
          x: point.x,
          y: point.y,
          width: DEFAULT_TEXT_WIDTH,
          height: DEFAULT_TEXT_HEIGHT,
          text: "",
          fontSize: 16,
          color: pendingColor,
          bold: false,
        });
        onToolConsumed();
        setEditingId(id);
        setDraft("");
        return;
      }

      if (activeTool === "rect" || activeTool === "highlight" || activeTool === "redact") {
        gestureRef.current = { kind: "draw-rect", startX: point.x, startY: point.y };
        setDrawingRect({ x: point.x, y: point.y, width: 0, height: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      if (activeTool === "draw") {
        gestureRef.current = { kind: "draw-path" };
        setDrawingPath([point]);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    [activeTool, editingId, pageIndex, pendingColor, onAddElement, onSelect, onToolConsumed, toPagePoint],
  );

  const handleOverlayPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const point = toPagePoint(event.clientX, event.clientY);

      if (gesture.kind === "draw-rect") {
        setDrawingRect({
          x: Math.min(gesture.startX, point.x),
          y: Math.min(gesture.startY, point.y),
          width: Math.abs(point.x - gesture.startX),
          height: Math.abs(point.y - gesture.startY),
        });
      } else if (gesture.kind === "draw-path") {
        setDrawingPath((prev) => (prev ? [...prev, point] : [point]));
      } else if (gesture.kind === "move") {
        const dx = point.x - gesture.startX;
        const dy = point.y - gesture.startY;
        const patch: Partial<PathElement> & Partial<EditElement> = {
          x: gesture.originX + dx,
          y: gesture.originY + dy,
        };
        if (gesture.originPoints) {
          patch.points = gesture.originPoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        }
        onUpdateLive(gesture.id, patch);
      } else if (gesture.kind === "resize") {
        const width = Math.max(MIN_ELEMENT_SIZE, gesture.originWidth + (point.x - gesture.startX));
        const height = Math.max(MIN_ELEMENT_SIZE, gesture.originHeight + (point.y - gesture.startY));
        onUpdateLive(gesture.id, { width, height });
      }
    },
    [onUpdateLive, toPagePoint],
  );

  const handleOverlayPointerUp = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;

    if (gesture?.kind === "draw-rect") {
      const rect = drawingRect;
      setDrawingRect(null);
      if (!rect) return;
      const width = rect.width < MIN_DRAG_SIZE ? DEFAULT_SHAPE_SIZE : rect.width;
      const height = rect.height < MIN_DRAG_SIZE ? DEFAULT_SHAPE_SIZE : rect.height;
      const id = crypto.randomUUID();
      if (activeTool === "highlight") {
        onAddElement({
          id,
          type: "highlight",
          page: pageIndex,
          x: rect.x,
          y: rect.y,
          width,
          height,
          color: pendingColor,
        });
      } else if (activeTool === "redact") {
        onAddElement({
          id,
          type: "redact",
          page: pageIndex,
          x: rect.x,
          y: rect.y,
          width,
          height,
        });
      } else {
        onAddElement({
          id,
          type: "rect",
          page: pageIndex,
          x: rect.x,
          y: rect.y,
          width,
          height,
          color: pendingColor,
          opacity: 1,
          fill: false,
          strokeWidth: 2,
        });
      }
      onToolConsumed();
      return;
    }

    if (gesture?.kind === "draw-path") {
      const points = drawingPath;
      setDrawingPath(null);
      if (!points || points.length < 2) return;
      const pad = 6;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs) - pad;
      const minY = Math.min(...ys) - pad;
      const maxX = Math.max(...xs) + pad;
      const maxY = Math.max(...ys) + pad;
      onAddElement({
        id: crypto.randomUUID(),
        type: "path",
        page: pageIndex,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        points,
        color: pendingColor,
        strokeWidth: 3,
      });
      onToolConsumed();
      return;
    }

    if (gesture?.kind === "move" || gesture?.kind === "resize") {
      onEndDrag();
    }
  }, [activeTool, drawingRect, drawingPath, pageIndex, pendingColor, onAddElement, onToolConsumed, onEndDrag]);

  const handleElementPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement | SVGSVGElement>, el: EditElement) => {
      if (activeTool !== "select") return;
      event.stopPropagation();
      onSelect(el.id);
      const point = toPagePoint(event.clientX, event.clientY);
      onBeginDrag();
      gestureRef.current = {
        kind: "move",
        id: el.id,
        startX: point.x,
        startY: point.y,
        originX: el.x,
        originY: el.y,
        originPoints: el.type === "path" ? el.points : undefined,
      };
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    },
    [activeTool, onSelect, onBeginDrag, toPagePoint],
  );

  const handleResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, el: EditElement) => {
      event.stopPropagation();
      onBeginDrag();
      const point = toPagePoint(event.clientX, event.clientY);
      gestureRef.current = {
        kind: "resize",
        id: el.id,
        startX: point.x,
        startY: point.y,
        originWidth: el.width,
        originHeight: el.height,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [onBeginDrag, toPagePoint],
  );

  return (
    <div
      className="relative inline-block bg-white shadow-sm"
      style={{ width: pageSize.width * zoom, height: pageSize.height * zoom }}
    >
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
      <div
        ref={overlayRef}
        data-testid="editor-overlay"
        className="absolute left-0 top-0 h-full w-full touch-none"
        style={{ cursor: activeTool === "select" ? "default" : "crosshair" }}
        onPointerDown={handleOverlayPointerDown}
        onPointerMove={handleOverlayPointerMove}
        onPointerUp={handleOverlayPointerUp}
      >
        {pageElements.map((el) => (
          <ElementView
            key={el.id}
            element={el}
            zoom={zoom}
            selected={el.id === selectedId}
            editing={el.id === editingId}
            draft={draft}
            onDraftChange={setDraft}
            onCommitText={commitTextEdit}
            onPointerDown={(event) => handleElementPointerDown(event, el)}
            onResizePointerDown={(event) => handleResizePointerDown(event, el)}
            onDoubleClick={() => beginTextEdit(el)}
          />
        ))}

        {drawingRect ? (
          <div
            className="border-primary/70 bg-primary/10 absolute border-2 border-dashed"
            style={{
              left: drawingRect.x * zoom,
              top: drawingRect.y * zoom,
              width: drawingRect.width * zoom,
              height: drawingRect.height * zoom,
            }}
          />
        ) : null}

        {drawingPath && drawingPath.length > 1 ? (
          <svg
            className="pointer-events-none absolute left-0 top-0 h-full w-full"
            viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
            preserveAspectRatio="none"
          >
            <path
              d={drawingPath.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
              stroke={pendingColor}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </div>
      {children}
    </div>
  );
}

interface ElementViewProps {
  element: EditElement;
  zoom: number;
  selected: boolean;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onCommitText: () => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement | SVGSVGElement>) => void;
  onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
}

function ElementView({
  element,
  zoom,
  selected,
  editing,
  draft,
  onDraftChange,
  onCommitText,
  onPointerDown,
  onResizePointerDown,
  onDoubleClick,
}: ElementViewProps) {
  const style: CSSProperties = {
    left: element.x * zoom,
    top: element.y * zoom,
    width: element.width * zoom,
    height: element.height * zoom,
  };
  const selectedRing = selected ? "outline outline-2 outline-primary" : "";

  if (element.type === "text") {
    if (editing) {
      return (
        <textarea
          data-testid="editor-text-input"
          autoFocus
          className="border-primary absolute resize-none border-2 bg-white/90 px-1 leading-tight outline-none"
          style={{
            ...style,
            fontSize: element.fontSize * zoom,
            color: element.color,
            fontWeight: element.bold ? 700 : 400,
          }}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={onCommitText}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
        />
      );
    }
    return (
      <div
        data-testid="editor-element"
        data-element-type="text"
        className={`absolute cursor-move select-none whitespace-pre-wrap wrap-break-word px-1 leading-tight ${selectedRing}`}
        style={{
          ...style,
          fontSize: element.fontSize * zoom,
          color: element.color,
          fontWeight: element.bold ? 700 : 400,
        }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        {element.text}
        {selected ? <ResizeHandle onPointerDown={onResizePointerDown} /> : null}
      </div>
    );
  }

  if (element.type === "image") {
    return (
      <div
        data-testid="editor-element"
        data-element-type="image"
        className={`absolute cursor-move select-none ${selectedRing}`}
        style={style}
        onPointerDown={onPointerDown}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- locally-held data: URL, not a remote asset to optimize */}
        <img src={element.image} alt="" className="h-full w-full object-fill" draggable={false} />
        {selected ? <ResizeHandle onPointerDown={onResizePointerDown} /> : null}
      </div>
    );
  }

  if (element.type === "redact") {
    return (
      <div
        data-testid="editor-element"
        data-element-type="redact"
        className={`absolute flex cursor-move select-none items-center justify-center overflow-hidden bg-black text-[9px] font-semibold uppercase tracking-wide text-white/70 ${selectedRing}`}
        style={style}
        onPointerDown={onPointerDown}
      >
        REDACTED
        {selected ? <ResizeHandle onPointerDown={onResizePointerDown} /> : null}
      </div>
    );
  }

  if (element.type === "rect" || element.type === "highlight") {
    const isHighlight = element.type === "highlight";
    const filled = isHighlight || element.fill;
    return (
      <div
        data-testid="editor-element"
        data-element-type={element.type}
        className={`absolute cursor-move select-none ${selectedRing}`}
        style={{
          ...style,
          boxSizing: "border-box",
          backgroundColor: filled ? element.color : "transparent",
          opacity: isHighlight ? 0.4 : filled ? element.opacity : 1,
          border: isHighlight ? "none" : `${element.strokeWidth}px solid ${element.color}`,
        }}
        onPointerDown={onPointerDown}
      >
        {selected ? <ResizeHandle onPointerDown={onResizePointerDown} /> : null}
      </div>
    );
  }

  const localPath = element.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x - element.x} ${p.y - element.y}`)
    .join(" ");
  return (
    <svg
      data-testid="editor-element"
      data-element-type="path"
      className={`absolute cursor-move ${selectedRing}`}
      style={style}
      viewBox={`0 0 ${element.width} ${element.height}`}
      preserveAspectRatio="none"
      onPointerDown={onPointerDown}
    >
      <rect width={element.width} height={element.height} fill="transparent" />
      <path
        d={localPath}
        stroke={element.color}
        strokeWidth={element.strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      data-testid="editor-resize-handle"
      className="bg-primary absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full border border-white"
      onPointerDown={onPointerDown}
    />
  );
}
