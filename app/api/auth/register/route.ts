import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import {
  emailSchema,
  localeSchema,
  passwordMatchesEmail,
  passwordSchema,
} from "@/lib/auth/validation";
import { normalizeLocale, sendAccountExistsEmail, sendVerificationEmail } from "@/lib/auth/emails";
import { parseAuthRequest } from "@/lib/auth/request";
import { assertEmailConfigured } from "@/lib/email/mailer";
import { checkRateLimits } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1).max(100).optional(),
    locale: localeSchema,
  })
  .strict();

/**
 * Creates an unverified account and emails a verification link; signing
 * in requires verifying first. The response is identical whether or not
 * the email already has an account (no enumeration): an existing verified
 * account gets an "account exists" email instead, an existing unverified
 * one a fresh verification link. Both paths do the same bcrypt work, and
 * email is sent after the response (`after`), so timing doesn't tell them
 * apart either. Never logs the request body.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await checkRateLimits([{ key: `register:ip:${ip}`, limit: 10, windowSeconds: 3600 }]))) {
    return apiError("RATE_LIMITED");
  }

  const parsed = await parseAuthRequest(request, registerSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password, name } = parsed.data;
  const locale = normalizeLocale(parsed.data.locale);

  if (passwordMatchesEmail(password, email)) return apiError("VALIDATION_ERROR");
  if (!(await checkRateLimits([{ key: `register:email:${email}`, limit: 3, windowSeconds: 3600 }]))) {
    return apiError("RATE_LIMITED");
  }

  try {
    assertEmailConfigured();
  } catch {
    return apiError("EMAIL_UNAVAILABLE");
  }

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  let notify: () => Promise<void>;
  if (existing) {
    notify = existing.emailVerifiedAt
      ? () => sendAccountExistsEmail(existing, locale)
      : () => sendVerificationEmail(existing, locale);
  } else {
    const user = await prisma.user.create({ data: { email, passwordHash, name } });
    notify = () => sendVerificationEmail(user, locale);
  }

  after(async () => {
    try {
      await notify();
    } catch (error) {
      console.error(`[auth] registration email failed: ${error instanceof Error ? error.name : "unknown"}`);
    }
  });

  return NextResponse.json({ status: "verification_sent" }, { status: 202 });
}
