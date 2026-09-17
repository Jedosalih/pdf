import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-structured.pdf");
const imageFixture = path.join(__dirname, "../../docs/fixtures/sample-image-only.pdf");

/**
 * Real pipeline end to end: upload a real PDF, convert to HTML, and verify
 * the fixture's actual text survived in reading order -- not just that an
 * .html file came back.
 */
test("guest can convert a real PDF to HTML and the text content survives", async ({ page }) => {
  await page.goto("/en/pdf-to-html");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([fixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: "Start" }).click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const html = await readFile(downloadPath as string, "utf-8");
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain("Fixture Heading Marker");
  expect(html).toContain("First bullet item marker");
  expect(html).toContain("Alice");
});

/**
 * A PDF whose only content is a full-page image must still produce valid,
 * self-contained HTML -- the embedded image inlined as a base64 data URI,
 * not a broken reference to a sibling file that never gets uploaded.
 */
test("guest can convert an image-only PDF to HTML with the image embedded inline", async ({
  page,
}) => {
  await page.goto("/en/pdf-to-html");
  await page.locator('input[type="file"]').setInputFiles([imageFixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: "Start" }).click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const downloadPath = await download.path();
  const html = await readFile(downloadPath as string, "utf-8");

  expect(html).toContain('src="data:image/png;base64,');
  expect(html).not.toMatch(/src="(?!data:)[^"]+"/);
});
