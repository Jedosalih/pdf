import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { emailSchema, localeSchema } from "@/lib/auth/validation";
import { normalizeLocale, sendVerificationEmail } from "@/lib/auth/emails";
import { parseAuthRequest } from "@/lib/auth/request";
import { assertEmailConfigured } from "@/lib/email/mailer";
import { checkRateLimits } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/clientIp";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const resendSchema = z.object({ email: emailSchema, locale: localeSchema }).strict();

/** Always the same 202, whether or not the email has an unverified
 * account; a new link (invalidating older ones) is sent only if it does.
 * Throttled per IP and per email address. */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await checkRateLimits([{ key: `resend:ip:${ip}`, limit: 10, windowSeconds: 3600 }]))) {
    return apiError("RATE_LIMITED");
  }
  const parsed = await parseAuthRequest(request, resendSchema);
  if (!parsed.ok) return parsed.response;
  const { email } = parsed.data;
  const locale = normalizeLocale(parsed.data.locale);

  if (!(await checkRateLimits([{ key: `resend:email:${email}`, limit: 3, windowSeconds: 3600 }]))) {
    return apiError("RATE_LIMITED");
  }
  try {
    assertEmailConfigured();
  } catch {
    return apiError("EMAIL_UNAVAILABLE");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt && !user.disabledAt) {
    after(async () => {
      try {
        await sendVerificationEmail(user, locale);
      } catch (error) {
        console.error(`[auth] verification email failed: ${error instanceof Error ? error.name : "unknown"}`);
      }
    });
  }
  return NextResponse.json({ status: "verification_sent" }, { status: 202 });
}
