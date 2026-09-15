import { test, expect } from "@playwright/test";
import path from "node:path";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");

/**
 * Guest -> Compress PDF -> Sign up: the guest-owned result file must be
 * reassigned to the new account (lib/auth/migrateGuestData.ts), not lost.
 * Drives the real compress pipeline rather than a synthetic fixture, then
 * verifies migration through the actual My Documents UI.
 */
test("guest upload is migrated to the account created at signup", async ({ page }) => {
  await page.goto("/en/compress-pdf");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 30_000 });

  const email = `e2e-migrate-${Date.now()}@example.com`;
  await page.goto("/en/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correcthorsebattery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/workspace");

  await page.goto("/en/workspace/documents");
  await expect(page.getByText("compressed.pdf")).toBeVisible({ timeout: 10_000 });
});
