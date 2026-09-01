"use client";

import { Toaster as SonnerToaster } from "sonner";

export { toast } from "sonner";

/** One Toaster, mounted once in app/[locale]/layout.tsx. Styled to match
 * our own tokens via classNames (not the default Sonner look). */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "!rounded-md !border !border-border !bg-background !text-foreground !shadow-md !font-sans",
          title: "!text-small !font-semibold",
          description: "!text-caption !text-muted-foreground",
          actionButton: "!bg-primary !text-white",
          cancelButton: "!bg-surface !text-foreground",
          closeButton: "!border-border !bg-background !text-muted-foreground",
        },
      }}
    />
  );
}
