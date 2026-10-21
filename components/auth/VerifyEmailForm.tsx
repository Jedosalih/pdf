"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Link, useRouter } from "@/lib/i18n/navigation";

/** An explicit button, not an automatic request on page load: mail
 * scanners that prefetch links must not consume the single-use token. */
export function VerifyEmailForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [state, setState] = useState<"idle" | "submitting" | "invalid" | "error">("idle");

  const confirm = async () => {
    setState("submitting");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (response.ok) {
        router.push("/workspace");
        router.refresh();
        return;
      }
      setState(response.status >= 500 || response.status === 429 ? "error" : "invalid");
    } catch {
      setState("error");
    }
  };

  if (state === "invalid") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">{t("verify.invalid")}</Alert>
        <Link href="/login" className="text-center text-small font-medium text-primary hover:underline">
          {t("verify.requestNew")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state === "error" ? <Alert variant="error">{t("errors.generic")}</Alert> : null}
      <Button onClick={() => void confirm()} disabled={state === "submitting"} loading={state === "submitting"}>
        {t("verify.submit")}
      </Button>
    </div>
  );
}
