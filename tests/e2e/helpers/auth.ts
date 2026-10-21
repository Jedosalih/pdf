import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomTestIp } from "./api";
import { linkPath, tokenFrom, waitForEmail } from "./mail";

export const TEST_PASSWORD = "correcthorsebattery";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Real sign-up through the UI: register, read the confirmation email from
 * Mailpit, open its link and confirm. Ends signed in on /workspace. */
export async function signUpAndVerify(page: Page, email: string, password = TEST_PASSWORD): Promise<void> {
  // Own per-IP rate-limit bucket per sign-up (see helpers/api.ts), so
  // repeated suite runs never trip the real registration limit.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomTestIp() });
  await page.goto("/en/signup");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByTestId("signup-check-email")).toBeVisible();

  const mail = await waitForEmail(email, "Confirm your JPdf account");
  await page.goto(linkPath(mail, "/verify-email"));
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await page.waitForURL("**/workspace");
}

/** Same flow over the API (for tests exercising server limits). The
 * request context ends up holding the session cookie. */
export async function registerAndVerifyViaApi(
  request: APIRequestContext,
  email: string,
  headers: Record<string, string> = {},
  password = TEST_PASSWORD,
): Promise<void> {
  const register = await request.post("/api/auth/register", { data: { email, password }, headers });
  expect(register.status()).toBe(202);
  const mail = await waitForEmail(email, "Confirm your JPdf account");
  const verify = await request.post("/api/auth/verify-email", {
    data: { token: tokenFrom(linkPath(mail, "/verify-email")) },
    headers,
  });
  expect(verify.status()).toBe(200);
}
