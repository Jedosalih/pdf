"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

/** A file that already exists in a signed-in user's workspace — carried by
 * reference (id), never by re-uploading its bytes. */
export interface PendingWorkspaceFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

interface PendingUploadContextValue {
  setFile: (file: File) => void;
  consume: () => File | null;
  setWorkspaceFile: (file: PendingWorkspaceFile) => void;
  consumeWorkspaceFile: () => PendingWorkspaceFile | null;
}

const PendingUploadContext = createContext<PendingUploadContextValue | null>(null);

/**
 * Carries a single pending file into whichever tool page the user picks
 * next, without an intermediate server upload where one isn't needed:
 *
 * - `setFile`/`consume`: an in-memory File from the homepage's hero
 *   dropzone (the tool doesn't exist yet at drop time — see
 *   docs/DECISIONS.md).
 * - `setWorkspaceFile`/`consumeWorkspaceFile`: a reference to a file a
 *   signed-in user already has in their workspace (chosen via "Use in a
 *   tool" on an existing document), carried by id so the destination tool
 *   can reuse the already-uploaded file directly instead of downloading
 *   and re-uploading its bytes.
 *
 * This only works because `app/[locale]/layout.tsx` is the sole layout
 * above every route — a same-locale client-side navigation (`router.push`,
 * never a full reload) doesn't remount it, so this provider's React state
 * survives the cross-page transition. A hard reload loses the pending
 * value — accepted trade-off; the destination tool page just falls back
 * to its normal empty upload state.
 *
 * Both `consume*` functions are atomic read-and-clear so a second call
 * (e.g. React Strict Mode's double-invoked dev effects) safely no-ops
 * instead of re-delivering the same file twice.
 */
export function PendingUploadProvider({ children }: { children: ReactNode }) {
  const fileRef = useRef<File | null>(null);
  const workspaceFileRef = useRef<PendingWorkspaceFile | null>(null);

  const setFile = useCallback((file: File) => {
    fileRef.current = file;
  }, []);

  const consume = useCallback(() => {
    const file = fileRef.current;
    fileRef.current = null;
    return file;
  }, []);

  const setWorkspaceFile = useCallback((file: PendingWorkspaceFile) => {
    workspaceFileRef.current = file;
  }, []);

  const consumeWorkspaceFile = useCallback(() => {
    const file = workspaceFileRef.current;
    workspaceFileRef.current = null;
    return file;
  }, []);

  const value = useMemo(
    () => ({ setFile, consume, setWorkspaceFile, consumeWorkspaceFile }),
    [setFile, consume, setWorkspaceFile, consumeWorkspaceFile],
  );

  return <PendingUploadContext.Provider value={value}>{children}</PendingUploadContext.Provider>;
}

export function usePendingUpload(): PendingUploadContextValue {
  const ctx = useContext(PendingUploadContext);
  if (!ctx) {
    throw new Error("usePendingUpload must be used within a PendingUploadProvider");
  }
  return ctx;
}
