import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");
const PASSWORD = "TestPass123";

/**
 * Real pipeline end to end: upload a 3-page PDF, protect it with a password,
 * download the result, and verify the output is genuinely encrypted — it
 * must reject the wrong password and only open with the exact password that
 * was set, with the original page content intact once opened.
 */
test("guest can protect a real PDF and only the chosen password opens it", async ({
  page,
}) => {
  await page.goto("/en/protect-pdf");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles([fixture]);

  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByLabel("Password").fill(PASSWORD);

  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  const downloadLink = page.getByRole("link", { name: "Download" });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadLink.click(),
  ]);

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const bytes = await readFile(downloadPath as string);

  await expect(
    getDocument({
      data: new Uint8Array(bytes),
      password: "definitely-the-wrong-password",
      useWorkerFetch: false,
    }).promise,
  ).rejects.toThrow();

  const pageTexts = await extractFirstLinePerPage(bytes, PASSWORD);
  expect(pageTexts).toEqual([
    "Fixture-B - page 1",
    "Fixture-B - page 2",
    "Fixture-B - page 3",
  ]);
});
