"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";

interface SettingsFormProps {
  initialName: string;
  email: string;
}

const errorKeyByCode: Record<string, string> = {
  INVALID_CREDENTIALS: "invalidCredentials",
};

export function SettingsForm({ initialName, email }: SettingsFormProps) {
  const t = useTranslations("workspace.settings");
  const tAuth = useTranslations("auth");
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordErrorCode, setPasswordErrorCode] = useState<string | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileSaved(false);
    await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSavingProfile(false);
    setProfileSaved(true);
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordSaved(false);
    setPasswordErrorCode(null);

    const response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSavingPassword(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setPasswordErrorCode(body?.error?.code ?? "generic");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setPasswordSaved(true);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <h2 className="text-h3 font-semibold text-foreground">{t("profileTitle")}</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
            <Input
              label={t("nameLabel")}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setProfileSaved(false);
              }}
            />
            <Input label={t("emailLabel")} value={email} disabled />
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={savingProfile} loading={savingProfile}>
                {t("save")}
              </Button>
              {profileSaved ? (
                <span className="text-small text-success">{t("saved")}</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-h3 font-semibold text-foreground">{t("changePasswordTitle")}</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <Input
              label={t("currentPasswordLabel")}
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <Input
              label={t("newPasswordLabel")}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            {passwordErrorCode ? (
              <Alert variant="error">
                {tAuth(`errors.${errorKeyByCode[passwordErrorCode] ?? "generic"}`)}
              </Alert>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={savingPassword} loading={savingPassword}>
                {t("changePassword")}
              </Button>
              {passwordSaved ? (
                <span className="text-small text-success">{t("passwordChanged")}</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <Button
          variant="destructive"
          size="sm"
          disabled={loggingOut}
          loading={loggingOut}
          onClick={() => void handleLogout()}
        >
          {t("logout")}
        </Button>
      </div>
    </div>
  );
}
