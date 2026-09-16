import { test, expect } from "@playwright/test";
import path from "node:path";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");

test("star, trash, and restore a document from the workspace UI", async ({ page }) => {
  const email = `e2e-star-trash-${Date.now()}@example.com`;
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

  await page.goto("/en/workspace/documents");
  await expect(page.getByText("compressed.pdf")).toBeVisible();

  await page.getByLabel("More actions").click();
  await page.getByRole("menuitem", { name: "Star" }).click();
  await expect(page.getByText("compressed.pdf")).toBeVisible();

  await page.goto("/en/workspace/starred");
  await expect(page.getByText("compressed.pdf")).toBeVisible();

  await page.getByLabel("More actions").click();
  await page.getByRole("menuitem", { name: "Move to trash" }).click();
  await expect(page.getByText("compressed.pdf")).toHaveCount(0);

  await page.goto("/en/workspace/documents");
  await expect(page.getByText("compressed.pdf")).toHaveCount(0);

  await page.goto("/en/workspace/trash");
  await expect(page.getByText("compressed.pdf")).toBeVisible();

  await page.getByLabel("More actions").click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  await expect(page.getByText("compressed.pdf")).toHaveCount(0);

  await page.goto("/en/workspace/documents");
  await expect(page.getByText("compressed.pdf")).toBeVisible();
});
