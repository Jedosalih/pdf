"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Period = "morning" | "afternoon" | "evening";

/**
 * Computed from the browser's local time, not the server clock — a
 * server-rendered "Good evening" would be wrong for a user whose local
 * time is actually morning. Defaults to "morning" for the very first
 * render (same value on server and client) to avoid a hydration mismatch,
 * then corrects itself after mount — a brief, acceptable flash rather than
 * a wrong greeting or a hydration warning.
 */
export function Greeting({ name }: { name?: string | null }) {
  const t = useTranslations("workspace.greeting");
  const [period, setPeriod] = useState<Period>("morning");

  useEffect(() => {
    const hour = new Date().getHours();
    const computed = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    // Deferred to a microtask (not called synchronously in the effect body)
    // to satisfy eslint-plugin-react-hooks's set-state-in-effect rule.
    void Promise.resolve().then(() => setPeriod(computed));
  }, []);

  return (
    <div>
      <h1 className="text-h1 font-bold text-foreground">
        {t(period)}
        {name ? `, ${name}` : ""}
      </h1>
      <p className="mt-1 text-body text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
}
