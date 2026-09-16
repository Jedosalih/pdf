import { test, expect } from "@playwright/test";

/**
 * An invalid session (corrupted/unknown token — the same code path an
 * actually-expired session hits in getSessionUser(), since both fail the
 * same `Session.findUnique` lookup) must fall back to guest silently and
 * redirect a protected /workspace visit to /login, not error.
 */
test("an invalid session falls back to guest and redirects /workspace to /login", async ({
  page,
  context,
}) => {
  const email = `e2e-session-expiry-${Date.now()}@example.com`;
  await page.goto("/en/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correcthorsebattery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/workspace");

  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === "jdpdf_session");
  expect(sessionCookie).toBeDefined();
  await context.addCookies([{ ...sessionCookie!, value: "corrupted-invalid-token" }]);

  await page.goto("/en/workspace");
  await page.waitForURL("**/login");
});
