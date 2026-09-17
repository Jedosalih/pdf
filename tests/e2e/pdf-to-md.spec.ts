import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-structured.pdf");
const imageFixture = path.join(__dirname, "../../docs/fixtures/sample-image-only.pdf");

/**
 * Real pipeline end to end: upload a PDF with a genuine heading (large
 * font), a wrapped paragraph, a bullet list, and a simple two-column
 * table, and verify the downloaded Markdown actually contains real
 * Markdown syntax for each -- a heading marker, list markers, and table
 * pipe syntax -- not just the same words as a flat text dump.
 */
test("guest can convert a real PDF to structured Markdown", async ({ page }) => {
  await page.goto("/en/pdf-to-md");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([fixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: "Start" }).click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const markdown = await readFile(downloadPath as string, "utf-8");
  expect(markdown).toContain("# Fixture Heading Marker");
  expect(markdown).toContain("- First bullet item marker");
  expect(markdown).toContain("- Second bullet item marker");
  expect(markdown).toContain("- Third bullet item marker");
  expect(markdown).toMatch(/\|\s*Name\s*\|\s*Score\s*\|/);
  expect(markdown).toMatch(/\|\s*Alice\s*\|\s*92\s*\|/);
  expect(markdown).toContain(
    "This is the first line of a wrapped paragraph that continues on the very next line of the same paragraph.",
  );
});

/**
 * A genuinely image-only PDF has no extractable text to build Markdown
 * structure from at all -- this must fail clearly with a specific,
 * actionable error rather than silently produce an empty or garbage file.
 */
test("guest sees a clear error converting a fully image-only PDF to Markdown", async ({
  page,
}) => {
  await page.goto("/en/pdf-to-md");
  await page.locator('input[type="file"]').setInputFiles([imageFixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("button", { name: "Start" }).click();

  await expect(
    page.getByText(
      "This file has no extractable text (it looks like a scanned or image-only PDF).",
      { exact: false },
    ),
  ).toBeVisible({ timeout: 30_000 });
});
