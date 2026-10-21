"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface ResendVerificationButtonProps {
  email: string;
  label: string;
  sentMessage: string;
}

/** The server answers the same way whether or not the address has a
 * pending confirmation, so the UI does too. */
export function ResendVerificationButton({ email, label, sentMessage }: ResendVerificationButtonProps) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorKey, setErrorKey] = useState("generic");

  const resend = async () => {
    setState("sending");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      if (response.ok) {
        setState("sent");
        return;
      }
      const body = await response.json().catch(() => null);
      setErrorKey(
        body?.error?.code === "RATE_LIMITED"
          ? "rateLimited"
          : body?.error?.code === "EMAIL_UNAVAILABLE"
            ? "emailUnavailable"
            : "generic",
      );
      setState("error");
    } catch {
      setErrorKey("generic");
      setState("error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {state === "sent" ? <Alert variant="success">{sentMessage}</Alert> : null}
      {state === "error" ? <Alert variant="error">{t(`errors.${errorKey}`)}</Alert> : null}
      <Button
        type="button"
        variant="secondary"
        onClick={() => void resend()}
        disabled={state === "sending" || state === "sent"}
        loading={state === "sending"}
      >
        {label}
      </Button>
    </div>
  );
}
