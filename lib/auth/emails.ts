import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { routing, type Locale } from "@/lib/i18n/routing";
import { sendEmail } from "@/lib/email/mailer";
import {
  createAuthToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from "./tokens";

type Template = "verifyEmail" | "resetPassword" | "accountExists";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Links are built only from the configured public URL, never from request
 * headers, so a forged Host header can't redirect a reset link elsewhere. */
function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

export function normalizeLocale(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

async function render(template: Template, locale: Locale, link: string) {
  const t = await getTranslations({ locale, namespace: "auth" });
  const subject = t(`email.${template}.subject`);
  const body = t(`email.${template}.body`);
  const action = t(`email.${template}.action`);
  const footer = t(`email.${template}.footer`);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const text = `${body}\n\n${action}: ${link}\n\n${footer}\n`;
  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px">
<p>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">${escapeHtml(action)}</a></p>
<p style="font-size:13px;color:#555;word-break:break-all">${escapeHtml(link)}</p>
<p style="font-size:13px;color:#555">${escapeHtml(footer)}</p>
</body></html>`;
  return { subject, text, html };
}

/** Sends and records the outcome (template + status only; never the link
 * or token). Rethrows so callers decide how a failure is surfaced. */
async function deliver(template: Template, to: string, userId: string | null, locale: Locale, link: string) {
  const message = await render(template, locale, link);
  try {
    await sendEmail({ to, ...message });
    await prisma.emailEvent.create({ data: { userId, toEmail: to, template, status: "sent" } });
  } catch (error) {
    await prisma.emailEvent.create({ data: { userId, toEmail: to, template, status: "failed" } }).catch(() => undefined);
    throw error;
  }
}

export async function sendVerificationEmail(user: { id: string; email: string }, locale: Locale) {
  const token = await createAuthToken(user.id, "EMAIL_VERIFICATION", VERIFICATION_TOKEN_TTL_MS);
  await deliver("verifyEmail", user.email, user.id, locale, appUrl(`/${locale}/verify-email?token=${token}`));
}

export async function sendPasswordResetEmail(user: { id: string; email: string }, locale: Locale) {
  const token = await createAuthToken(user.id, "PASSWORD_RESET", PASSWORD_RESET_TOKEN_TTL_MS);
  await deliver("resetPassword", user.email, user.id, locale, appUrl(`/${locale}/reset-password?token=${token}`));
}

/** Sent instead of an error when someone registers with an email that
 * already has a verified account, so the API response never reveals it. */
export async function sendAccountExistsEmail(user: { id: string; email: string }, locale: Locale) {
  await deliver("accountExists", user.email, user.id, locale, appUrl(`/${locale}/forgot-password`));
}
