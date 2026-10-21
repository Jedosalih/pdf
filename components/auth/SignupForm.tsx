"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ResendVerificationButton } from "./ResendVerificationButton";

const errorKeyByCode: Record<string, string> = {
  RATE_LIMITED: "rateLimited",
  VALIDATION_ERROR: "weakPassword",
  EMAIL_UNAVAILABLE: "emailUnavailable",
};

const MIN_PASSWORD_LENGTH = 10;

/**
 * Signing up never signs in directly: the account must be confirmed via
 * the emailed link first. The confirmation screen is shown for every
 * accepted request -- the server's response doesn't reveal whether the
 * address already had an account, and neither does this screen.
 */
export function SignupForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorCode(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, email, password, locale }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorCode(body?.error?.code ?? "generic");
        setSubmitting(false);
        return;
      }
      setSentTo(email.trim().toLowerCase());
    } catch {
      setErrorCode("generic");
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4" data-testid="signup-check-email">
        <h2 className="text-h3 font-semibold text-foreground">{t("signup.checkEmailTitle")}</h2>
        <p className="text-small text-muted-foreground">{t("signup.checkEmailBody", { email: sentTo })}</p>
        <ResendVerificationButton email={sentTo} label={t("signup.resend")} sentMessage={t("signup.resent")} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t("signup.nameLabel")}
        autoComplete="name"
        maxLength={100}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label={t("signup.emailLabel")}
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label={t("signup.passwordLabel")}
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={72}
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
