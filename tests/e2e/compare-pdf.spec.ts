import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const originalFixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");
const revisedFixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");

/**
 * Real pipeline end to end, verifying the two genuinely different
 * comparisons the tool produces -- never conflated into one score:
 *
 * 1. A text-level diff of the full extracted content of both documents,
 *    checked here by asserting the original's lines are marked removed
 *    and the revised's lines are marked added in the downloaded report.
 * 2. A page-by-page visual (pixel) diff, checked by asserting the report
 *    contains an embedded diff image and a nonzero differing-pixel count
 *    for a page pair that's genuinely different (these two fixtures
 *    render as different solid background colors with different text).
 */
test("guest can compare two real PDFs and get both a text diff and a visual diff", async ({
  page,
}) => {
  await page.goto("/en/compare-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page
    .getByTestId("compare-slot-original")
    .locator('input[type="file"]')
    .setInputFiles(originalFixture);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page
    .getByTestId("compare-slot-revised")
    .locator('input[type="file"]')
    .setInputFiles(revisedFixture);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const html = await readFile(downloadPath as string, "utf8");

  // Text diff: original's own lines removed, revised's own lines added.
  expect(html).toMatch(/<div class="line removed"><span class="marker">-<\/span>Fixture-A - page 1<\/div>/);
  expect(html).toMatch(/<div class="line removed"><span class="marker">-<\/span>Fixture-A - page 2<\/div>/);
  expect(html).toMatch(/<div class="line added"><span class="marker">\+<\/span>Fixture-B - page 1<\/div>/);
  expect(html).toMatch(/<div class="line added"><span class="marker">\+<\/span>Fixture-B - page 3<\/div>/);

  // Visual diff: a real embedded diff image with a nonzero differing-pixel
  // count -- these fixtures render as different solid colors, so page 1
  // must show a large, genuine difference, not a placeholder.
  expect(html).toContain("data:image/png;base64,");
  const pixelCountMatch = /Page 1 -- ([\d,]+) pixels differ \(([\d.]+)%\)/.exec(html);
  expect(pixelCountMatch).not.toBeNull();
  const percent = Number.parseFloat(pixelCountMatch![2]!);
  expect(percent).toBeGreaterThan(50);

  // The report also discloses the page-count mismatch rather than
  // silently ignoring the extra page.
  expect(html).toContain("has 2 page(s)");
  expect(html).toContain("has 3 page(s)");
});

// Before 2026-10-21 the Original slot had no remove button once a Revised
// file was chosen, so a wrong original couldn't be replaced. Replacing it
// must keep the revised file and the comparison direction.
test("the original file can be replaced without losing the revised one", async ({ page }) => {
  await page.goto("/en/compare-pdf");
  await page.waitForLoadState("networkidle");
  const originalSlot = page.getByTestId("compare-slot-original");
  const revisedSlot = page.getByTestId("compare-slot-revised");

  await originalSlot.locator('input[type="file"]').setInputFiles(path.join(__dirname, "../../docs/fixtures/sample-c-6page.pdf"));
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await revisedSlot.locator('input[type="file"]').setInputFiles(revisedFixture);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await originalSlot.getByRole("button", { name: "Remove" }).click();
  await expect(revisedSlot).toContainText("sample-b-3page.pdf");
  await originalSlot.locator('input[type="file"]').setInputFiles(originalFixture);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await expect(originalSlot).toContainText("sample-a-2page.pdf");
  await expect(revisedSlot).toContainText("sample-b-3page.pdf");

  await page.getByRole("button", { name: "Start" }).click();
  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
  const html = await readFile((await download.path()) as string, "utf8");
  expect(html).toMatch(/<div class="line removed"><span class="marker">-<\/span>Fixture-A - page 1<\/div>/);
  expect(html).toMatch(/<div class="line added"><span class="marker">\+<\/span>Fixture-B - page 1<\/div>/);
  expect(html).not.toContain("Fixture-C");
});
