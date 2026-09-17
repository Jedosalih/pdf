"use client";

import { useCallback, useRef, useState } from "react";
import type { EditElement, EditorTool } from "./types";

/**
 * Snapshot-based undo/redo -- element counts in an annotation editor stay
 * small (a handful to a few dozen), so copying the whole array per step is
 * simpler and safer than a command/diff log, at negligible cost.
 *
 * A whole drag/resize gesture is one undo step: EditorCanvas calls
 * `beginDrag()` on pointerdown (snapshotting state *before* the gesture)
 * and `endDrag()` on pointerup (pushing that pre-drag snapshot to history),
 * while every pointermove in between calls `updateElementLive` with no
 * history writes.
 */
export function useEditorState() {
  const [elements, setElements] = useState<EditElement[]>([]);
  const [past, setPast] = useState<EditElement[][]>([]);
  const [future, setFuture] = useState<EditElement[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveToolState] = useState<EditorTool>("select");
  const dragSnapshotRef = useRef<EditElement[] | null>(null);

  const snapshotBeforeChange = useCallback(() => {
    setPast((prev) => [...prev, elements]);
    setFuture([]);
  }, [elements]);

  const addElement = useCallback(
    (element: EditElement) => {
      snapshotBeforeChange();
      setElements((prev) => [...prev, element]);
      setSelectedId(element.id);
      setActiveToolState("select");
    },
    [snapshotBeforeChange],
  );

  const updateElementLive = useCallback((id: string, patch: Partial<EditElement>) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id ? ({ ...el, ...patch } as EditElement) : el)),
    );
  }, []);

  const updateElementCommitted = useCallback(
    (id: string, patch: Partial<EditElement>) => {
      snapshotBeforeChange();
      updateElementLive(id, patch);
    },
    [snapshotBeforeChange, updateElementLive],
  );

  const beginDrag = useCallback(() => {
    dragSnapshotRef.current = elements;
  }, [elements]);

  const endDrag = useCallback(() => {
    const snapshot = dragSnapshotRef.current;
    if (snapshot) {
      setPast((prev) => [...prev, snapshot]);
      setFuture([]);
      dragSnapshotRef.current = null;
    }
  }, []);

  const deleteElement = useCallback(
    (id: string) => {
      snapshotBeforeChange();
      setElements((prev) => prev.filter((el) => el.id !== id));
      setSelectedId((current) => (current === id ? null : current));
    },
    [snapshotBeforeChange],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    deleteElement(selectedId);
  }, [selectedId, deleteElement]);

  const undo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1]!;
      setFuture((f) => [elements, ...f]);
      setElements(last);
      return prev.slice(0, -1);
    });
    setSelectedId(null);
  }, [elements]);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[0]!;
      setPast((p) => [...p, elements]);
      setElements(next);
      return prev.slice(1);
    });
    setSelectedId(null);
  }, [elements]);

  return {
    elements,
    selectedId,
    activeTool,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    setActiveTool: setActiveToolState,
    selectElement: setSelectedId,
    addElement,
    updateElementLive,
    updateElementCommitted,
    beginDrag,
    endDrag,
    deleteElement,
    deleteSelected,
    undo,
    redo,
  };
}
