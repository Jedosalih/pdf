import "dotenv/config";
import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { createAuthToken } from "@/lib/auth/tokens";
import { prisma } from "@/lib/db/client";
import { randomTestIp } from "./helpers/api";
import { registerAndVerifyViaApi, signUpAndVerify, TEST_PASSWORD, uniqueEmail } from "./helpers/auth";
import { countEmails, linkPath, tokenFrom, waitForEmail } from "./helpers/mail";

/**
 * The full account lifecycle against the real SMTP path (Mailpit capture
 * server): registration without enumeration, verification, login rules,
 * resend, password reset, token expiry/single use, session revocation,
 * input hardening and rate limits. Expired tokens are minted with the
 * app's own `createAuthToken` (negative TTL) against the same database.
 */
const BASE = "http://localhost:3000";

async function freshContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": randomTestIp() } });
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("registering an existing email gives the identical response and only emails the owner", async () => {
  const email = uniqueEmail("dup");
  const owner = await freshContext();
  await registerAndVerifyViaApi(owner, email);

  const attacker = await freshContext();
  const second = await attacker.post("/api/auth/register", { data: { email, password: "a-different-password-1" } });
  expect(second.status()).toBe(202);
  expect(await second.json()).toEqual({ status: "verification_sent" });

  const notice = await waitForEmail(email, "Your JPdf account");
  expect(notice.text).toContain("/forgot-password");
  expect(await prisma.user.count({ where: { email } })).toBe(1);

  // The attacker's password did not replace the owner's.
  const login = await attacker.post("/api/auth/login", { data: { email, password: "a-different-password-1" } });
  expect(login.status()).toBe(401);
  const ownerLogin = await (await freshContext()).post("/api/auth/login", { data: { email, password: TEST_PASSWORD } });
  expect(ownerLogin.status()).toBe(200);
});

test("an unverified account can't sign in, and only the right password reveals that", async () => {
  const email = uniqueEmail("unverified");
  const ctx = await freshContext();
  expect((await ctx.post("/api/auth/register", { data: { email, password: TEST_PASSWORD } })).status()).toBe(202);

  const wrong = await ctx.post("/api/auth/login", { data: { email, password: "not-the-password-1" } });
  expect(wrong.status()).toBe(401);
  expect((await wrong.json()).error.code).toBe("INVALID_CREDENTIALS");

  const unknown = await ctx.post("/api/auth/login", { data: { email: uniqueEmail("nobody"), password: TEST_PASSWORD } });
  expect((await unknown.json()).error.code).toBe("INVALID_CREDENTIALS");

  const right = await ctx.post("/api/auth/login", { data: { email, password: TEST_PASSWORD } });
  expect(right.status()).toBe(403);
  expect((await right.json()).error.code).toBe("EMAIL_NOT_VERIFIED");
  expect((await ctx.get("/api/auth/me")).status()).toBe(401);
});

test("verification links are single-use, and resending invalidates the previous one", async () => {
  const email = uniqueEmail("verify");
  const ctx = await freshContext();
  await ctx.post("/api/auth/register", { data: { email, password: TEST_PASSWORD } });
  const firstToken = tokenFrom(linkPath(await waitForEmail(email, "Confirm your JPdf account"), "/verify-email"));

  expect((await ctx.post("/api/auth/resend-verification", { data: { email } })).status()).toBe(202);
  const secondToken = tokenFrom(linkPath(await waitForEmail(email, "Confirm your JPdf account", 2), "/verify-email"));
  expect(secondToken).not.toBe(firstToken);

  const stale = await ctx.post("/api/auth/verify-email", { data: { token: firstToken } });
  expect((await stale.json()).error.code).toBe("INVALID_TOKEN");

  expect((await ctx.post("/api/auth/verify-email", { data: { token: secondToken } })).status()).toBe(200);
  expect((await ctx.get("/api/auth/me")).status()).toBe(200);

  const reused = await (await freshContext()).post("/api/auth/verify-email", { data: { token: secondToken } });
  expect((await reused.json()).error.code).toBe("INVALID_TOKEN");
});

test("expired verification and reset tokens are rejected", async () => {
  const email = uniqueEmail("expired");
  const ctx = await freshContext();
  await ctx.post("/api/auth/register", { data: { email, password: TEST_PASSWORD } });
  await waitForEmail(email, "Confirm your JPdf account");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  const expiredVerify = await createAuthToken(user.id, "EMAIL_VERIFICATION", -1000);
  const verify = await ctx.post("/api/auth/verify-email", { data: { token: expiredVerify } });
  expect((await verify.json()).error.code).toBe("INVALID_TOKEN");

  const expiredReset = await createAuthToken(user.id, "PASSWORD_RESET", -1000);
  const reset = await ctx.post("/api/auth/reset-password", { data: { token: expiredReset, password: "brand-new-password-9" } });
  expect((await reset.json()).error.code).toBe("INVALID_TOKEN");
});

test("forgot-password doesn't reveal whether an account exists", async () => {
  const email = uniqueEmail("forgot-known");
  await registerAndVerifyViaApi(await freshContext(), email);

  const known = await (await freshContext()).post("/api/auth/forgot-password", { data: { email } });
  const unknownEmail = uniqueEmail("forgot-unknown");
  const unknown = await (await freshContext()).post("/api/auth/forgot-password", { data: { email: unknownEmail } });

  expect(known.status()).toBe(unknown.status());
  expect(await known.json()).toEqual(await unknown.json());
  await waitForEmail(email, "Reset your JPdf password");
  // Give a would-be email to the unknown address time to arrive, then check none did.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(await countEmails(unknownEmail)).toBe(0);
});

test("password reset: weak passwords keep the link, success revokes every session, links are single-use", async () => {
  const email = uniqueEmail("reset");
  const signedIn = await freshContext();
  await registerAndVerifyViaApi(signedIn, email);
  expect((await signedIn.get("/api/auth/me")).status()).toBe(200);

  const ctx = await freshContext();
  await ctx.post("/api/auth/forgot-password", { data: { email } });
  const token = tokenFrom(linkPath(await waitForEmail(email, "Reset your JPdf password"), "/reset-password"));

  const weak = await ctx.post("/api/auth/reset-password", { data: { token, password: "short" } });
  expect(weak.status()).toBe(400);
  const containsEmail = await ctx.post("/api/auth/reset-password", {
    data: { token, password: `${email.split("@")[0]}-x` },
  });
  expect((await containsEmail.json()).error.code).toBe("VALIDATION_ERROR");

  const NEW_PASSWORD = "a-much-better-password-7";
  expect((await ctx.post("/api/auth/reset-password", { data: { token, password: NEW_PASSWORD } })).status()).toBe(200);

  expect((await signedIn.get("/api/auth/me")).status()).toBe(401);
  expect((await ctx.post("/api/auth/login", { data: { email, password: TEST_PASSWORD } })).status()).toBe(401);
  expect((await ctx.post("/api/auth/login", { data: { email, password: NEW_PASSWORD } })).status()).toBe(200);

  const reuse = await ctx.post("/api/auth/reset-password", { data: { token, password: "yet-another-password-3" } });
  expect((await reuse.json()).error.code).toBe("INVALID_TOKEN");
});

test("changing the password signs out other sessions but not this one", async () => {
  const email = uniqueEmail("change");
  const first = await freshContext();
  await registerAndVerifyViaApi(first, email);
  const second = await freshContext();
  expect((await second.post("/api/auth/login", { data: { email, password: TEST_PASSWORD } })).status()).toBe(200);

  const change = await first.patch("/api/auth/me", {
    data: { currentPassword: TEST_PASSWORD, newPassword: "changed-password-123" },
  });
  expect(change.status()).toBe(200);
  expect((await first.get("/api/auth/me")).status()).toBe(200);
  expect((await second.get("/api/auth/me")).status()).toBe(401);
});

test("auth endpoints reject malformed, oversized, unexpected and cross-site input", async () => {
  const ctx = await freshContext();
  const email = uniqueEmail("input");
  const cases: { name: string; status: number; send: () => Promise<{ status(): number }> }[] = [
    { name: "unknown field", status: 400, send: () => ctx.post("/api/auth/register", { data: { email, password: TEST_PASSWORD, role: "ADMIN" } }) },
    { name: "malformed email", status: 400, send: () => ctx.post("/api/auth/register", { data: { email: "not-an-email", password: TEST_PASSWORD } }) },
    { name: "overlong email", status: 400, send: () => ctx.post("/api/auth/forgot-password", { data: { email: `${"a".repeat(260)}@example.com` } }) },
    { name: "common password", status: 400, send: () => ctx.post("/api/auth/register", { data: { email, password: "password123" } }) },
    { name: "password too long in bytes", status: 400, send: () => ctx.post("/api/auth/register", { data: { email, password: "ş".repeat(40) } }) },
    { name: "non-JSON content type", status: 400, send: () => ctx.post("/api/auth/login", { headers: { "content-type": "text/plain" }, data: JSON.stringify({ email, password: TEST_PASSWORD }) }) },
    { name: "oversized body", status: 400, send: () => ctx.post("/api/auth/login", { data: { email, password: "x".repeat(20_000) } }) },
    { name: "malformed token", status: 400, send: () => ctx.post("/api/auth/verify-email", { data: { token: "../../etc" } }) },
    { name: "cross-site Origin", status: 403, send: () => ctx.post("/api/auth/login", { headers: { origin: "https://evil.example" }, data: { email, password: TEST_PASSWORD } }) },
    { name: "cross-site logout", status: 403, send: () => ctx.post("/api/auth/logout", { headers: { origin: "https://evil.example" } }) },
  ];
  for (const c of cases) {
    expect((await c.send()).status(), c.name).toBe(c.status);
  }
  expect(await prisma.user.count({ where: { email } })).toBe(0);
});

test("reset requests are throttled per email address, existing or not", async () => {
  const ctx = await freshContext();
  const email = uniqueEmail("throttle");
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) {
    statuses.push((await ctx.post("/api/auth/forgot-password", { data: { email } })).status());
  }
  expect(statuses).toEqual([202, 202, 202, 429]);
});

test("UI: forgot password -> email -> reset -> log in with the new password", async ({ page }) => {
  const email = uniqueEmail("ui-reset");
  await signUpAndVerify(page, email);
  await page.context().clearCookies();

  await page.goto("/en/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  // A first-compile page can render before it hydrates; a click in that
  // window submits nothing (no request is sent), so wait for it to settle.
  await page.waitForURL("**/forgot-password");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that email")).toBeVisible();

  const mail = await waitForEmail(email, "Reset your JPdf password");
  await page.goto(linkPath(mail, "/reset-password"));
  await page.waitForLoadState("networkidle");
  await page.getByLabel("New password", { exact: true }).fill("ui-new-password-42");
  await page.getByLabel("Confirm new password").fill("ui-new-password-42");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText("Your password has been changed.")).toBeVisible();

  await page.getByRole("link", { name: "Go to log in" }).click();
  await page.waitForURL("**/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("ui-new-password-42");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/workspace");
});

test("UI: an unverified login offers a new confirmation link, in Arabic too", async ({ page }) => {
  const email = uniqueEmail("ui-unverified");
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomTestIp() });
  await page.goto("/ar/signup");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByTestId("signup-check-email")).toBeVisible();

  const arabic = await waitForEmail(email, "JPdf");
  expect(arabic.subject).toBe("أكّد حسابك في JPdf");
  expect(arabic.html).toContain('dir="rtl"');

  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Please confirm your email address first.")).toBeVisible();
  await page.getByRole("button", { name: "Send a new confirmation link" }).click();
  await expect(page.getByText("a new link is on its way")).toBeVisible();
  await waitForEmail(email, "JPdf", 2);
});
