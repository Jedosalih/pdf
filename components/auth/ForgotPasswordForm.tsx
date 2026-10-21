"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const errorKeyByCode: Record<string, string> = {
  RATE_LIMITED: "rateLimited",
  EMAIL_UNAVAILABLE: "emailUnavailable",
};

/** Shows the same confirmation whether or not the address has an account. */
export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "sent">("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setState("submitting");
    setErrorCode(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      if (response.ok) {
        setState("sent");
        return;
      }
      const body = await response.json().catch(() => null);
      setErrorCode(body?.error?.code ?? "generic");
      setState("idle");
    } catch {
      setErrorCode("generic");
      setState("idle");
    }
  };

  if (state === "sent") {
    return <Alert variant="success">{t("forgot.sent")}</Alert>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t("forgot.emailLabel")}
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      {errorCode ? <Alert variant="error">{t(`errors.${errorKeyByCode[errorCode] ?? "generic"}`)}</Alert> : null}
      <Button type="submit" disabled={state === "submitting"} loading={state === "submitting"}>
        {t("forgot.submit")}
      </Button>
    </form>
  );
}
