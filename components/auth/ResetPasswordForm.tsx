"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Link } from "@/lib/i18n/navigation";

const MIN_PASSWORD_LENGTH = 10;

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "done" | "invalid">("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setErrorKey("mismatch");
      return;
    }
    setState("submitting");
    setErrorKey(null);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        setState("done");
        return;
      }
      const code = (await response.json().catch(() => null))?.error?.code;
      if (code === "INVALID_TOKEN") {
        setState("invalid");
        return;
      }
      setErrorKey(code === "VALIDATION_ERROR" ? "weakPassword" : code === "RATE_LIMITED" ? "rateLimited" : "generic");
      setState("idle");
    } catch {
      setErrorKey("generic");
      setState("idle");
    }
  };

  if (state === "done" || state === "invalid") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant={state === "done" ? "success" : "error"}>
          {t(state === "done" ? "reset.success" : "reset.invalid")}
        </Alert>
        <Link
          href={state === "done" ? "/login" : "/forgot-password"}
          className="text-center text-small font-medium text-primary hover:underline"
        >
          {t(state === "done" ? "reset.goToLogin" : "reset.requestNew")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t("reset.passwordLabel")}
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={72}
        hint={t("signup.passwordHint")}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Input
        label={t("reset.confirmLabel")}
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={72}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />
      {errorKey ? (
        <Alert variant="error">{errorKey === "mismatch" ? t("reset.mismatch") : t(`errors.${errorKey}`)}</Alert>
      ) : null}
      <Button type="submit" disabled={state === "submitting"} loading={state === "submitting"}>
        {t("reset.submit")}
      </Button>
    </form>
  );
}
