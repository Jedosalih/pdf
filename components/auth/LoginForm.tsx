"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { ResendVerificationButton } from "./ResendVerificationButton";

const errorKeyByCode: Record<string, string> = {
  INVALID_CREDENTIALS: "invalidCredentials",
  RATE_LIMITED: "rateLimited",
  VALIDATION_ERROR: "invalidCredentials",
};

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorCode(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorCode(body?.error?.code ?? "generic");
        setSubmitting(false);
        return;
      }
      router.push("/workspace");
      router.refresh();
    } catch {
      setErrorCode("generic");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t("login.emailLabel")}
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label={t("login.passwordLabel")}
        type="password"
        autoComplete="current-password"
        required
        maxLength={200}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Link href="/forgot-password" className="-mt-2 self-end text-small font-medium text-primary hover:underline">
        {t("login.forgotPassword")}
      </Link>
      {errorCode === "EMAIL_NOT_VERIFIED" ? (
        <>
          <Alert variant="warning">{t("login.notVerified")}</Alert>
          <ResendVerificationButton
            email={email}
            label={t("login.resendVerification")}
            sentMessage={t("login.verificationResent")}
          />
        </>
      ) : errorCode ? (
        <Alert variant="error">{t(`errors.${errorKeyByCode[errorCode] ?? "generic"}`)}</Alert>
      ) : null}
      <Button type="submit" disabled={submitting} loading={submitting} className="mt-2">
        {t("login.submit")}
      </Button>
    </form>
  );
}
