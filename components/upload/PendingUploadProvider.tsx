"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

interface PendingUploadContextValue {
  setFile: (file: File) => void;
  consume: () => File | null;
}

const PendingUploadContext = createContext<PendingUploadContextValue | null>(null);

/**
 * Carries a single in-memory File from the homepage's hero dropzone into
 * whichever tool page the user picks next, without an intermediate server
 * upload (the tool doesn't exist yet at drop time — see docs/DECISIONS.md).
 *
 * This only works because `app/[locale]/layout.tsx` is the sole layout
 * above every route — a same-locale client-side navigation (`router.push`,
 * never a full reload) doesn't remount it, so this provider's React state
 * survives the `/ -> /{locale}/{tool-slug}` transition. A hard reload loses
 * the in-memory File — accepted trade-off; the destination tool page just
 * falls back to its normal empty upload state.
 *
 * `consume()` is atomic read-and-clear so a second call (e.g. React Strict
 * Mode's double-invoked dev effects) safely no-ops instead of re-delivering
 * the same file twice.
 */
export function PendingUploadProvider({ children }: { children: ReactNode }) {
  const fileRef = useRef<File | null>(null);

  const setFile = useCallback((file: File) => {
    fileRef.current = file;
  }, []);

  const consume = useCallback(() => {
    const file = fileRef.current;
    fileRef.current = null;
    return file;
  }, []);

  const value = useMemo(() => ({ setFile, consume }), [setFile, consume]);

  return <PendingUploadContext.Provider value={value}>{children}</PendingUploadContext.Provider>;
}

export function usePendingUpload(): PendingUploadContextValue {
  const ctx = useContext(PendingUploadContext);
  if (!ctx) {
    throw new Error("usePendingUpload must be used within a PendingUploadProvider");
  }
  return ctx;
}
