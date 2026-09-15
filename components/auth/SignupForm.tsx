"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useRouter } from "@/lib/i18n/navigation";

const errorKeyByCode: Record<string, string> = {
  EMAIL_TAKEN: "emailTaken",
  RATE_LIMITED: "rateLimited",
  VALIDATION_ERROR: "weakPassword",
};

export function SignupForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorCode(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, email, password }),
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
        label={t("signup.nameLabel")}
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label={t("signup.emailLabel")}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label={t("signup.passwordLabel")}
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint={t("signup.passwordHint")}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {errorCode ? (
        <Alert variant="error">{t(`errors.${errorKeyByCode[errorCode] ?? "generic"}`)}</Alert>
      ) : null}
      <Button type="submit" disabled={submitting} loading={submitting} className="mt-2">
        {t("signup.submit")}
      </Button>
    </form>
  );
}
