"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useRouter } from "@/lib/i18n/navigation";

const errorKeyByCode: Record<string, string> = {
  INVALID_CREDENTIALS: "invalidCredentials",
  RATE_LIMITED: "rateLimited",
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
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label={t("login.passwordLabel")}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {errorCode ? (
        <Alert variant="error">{t(`errors.${errorKeyByCode[errorCode] ?? "generic"}`)}</Alert>
      ) : null}
      <Button type="submit" disabled={submitting} loading={submitting} className="mt-2">
        {t("login.submit")}
      </Button>
    </form>
  );
}
