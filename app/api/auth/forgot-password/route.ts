import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { emailSchema, localeSchema } from "@/lib/auth/validation";
import { normalizeLocale, sendPasswordResetEmail } from "@/lib/auth/emails";
import { parseAuthRequest } from "@/lib/auth/request";
import { assertEmailConfigured } from "@/lib/email/mailer";
import { checkRateLimits } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const forgotSchema = z.object({ email: emailSchema, locale: localeSchema }).strict();

/** Always the same 202 whether or not the address has an account (no
 * enumeration); a reset link (30 minutes, single use, invalidating older
 * ones) is emailed only if it does. The email is sent after the response
 * so timing doesn't reveal the difference. Throttled per IP and email. */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await checkRateLimits([{ key: `forgot:ip:${ip}`, limit: 10, windowSeconds: 3600 }]))) {
    return apiError("RATE_LIMITED");
  }
  const parsed = await parseAuthRequest(request, forgotSchema);
  if (!parsed.ok) return parsed.response;
  const { email } = parsed.data;
  const locale = normalizeLocale(parsed.data.locale);

  if (!(await checkRateLimits([{ key: `forgot:email:${email}`, limit: 3, windowSeconds: 3600 }]))) {
    return apiError("RATE_LIMITED");
  }
  try {
    assertEmailConfigured();
  } catch {
    return apiError("EMAIL_UNAVAILABLE");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.passwordHash && !user.disabledAt) {
    after(async () => {
      try {
        await sendPasswordResetEmail(user, locale);
      } catch (error) {
        console.error(`[auth] password reset email failed: ${error instanceof Error ? error.name : "unknown"}`);
      }
    });
  }
  return NextResponse.json({ status: "reset_sent" }, { status: 202 });
}
