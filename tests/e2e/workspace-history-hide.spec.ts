import { test, expect } from "@playwright/test";
import path from "node:path";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");

/**
 * "Delete" a history entry hides the Job (Job.hiddenAt), it must never
 * delete the underlying File — Job.inputFiles/outputFiles cascade-delete
 * FROM Job, so a real delete would destroy the user's actual document.
 */
test("hiding a history entry removes it from Recent without deleting the underlying file", async ({
  page,
}) => {
  const email = `e2e-history-hide-${Date.now()}@example.com`;
  await page.goto("/en/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correcthorsebattery");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/workspace");

  await page.goto("/en/compress-pdf");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 30_000 });

  await page.goto("/en/workspace/recent");
  await expect(page.getByText("Compress PDF")).toBeVisible();

  await page.getByLabel("More actions").click();
  await page.getByRole("menuitem", { name: "Remove from history" }).click();
  await expect(page.getByText("Compress PDF")).toHaveCount(0);

  // The file itself must survive and still be downloadable via My Documents.
  await page.goto("/en/workspace/documents");
  await expect(page.getByText("compressed.pdf")).toBeVisible();
});
