import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractFirstLinePerPage } from "./helpers/pdfText";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-b-3page.pdf");
const PASSWORD = "UnlockMe123";
const WRONG_PASSWORD = "DefinitelyWrong456";

/**
 * Real pipeline end to end. There's no pre-made encrypted fixture, so this
 * test first produces a genuinely password-protected PDF via the (already
 * verified) Protect PDF tool, then feeds that real encrypted file into
 * Unlock PDF — first with the wrong password (confirms the real
 * INVALID_PASSWORD error path), then the correct one, and verifies the
 * final output opens with no password at all and still has the original
 * page content.
 */
test("guest can unlock a real password-protected PDF using the known password", async ({
  page,
}) => {
  await page.goto("/en/protect-pdf");
  await page.locator('input[type="file"]').setInputFiles([fixture]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Start" }).click();

  const protectDownloadLink = page.getByRole("link", { name: "Download" });
  await expect(protectDownloadLink).toBeVisible({ timeout: 30_000 });
  const [protectedDownload] = await Promise.all([
    page.waitForEvent("download"),
    protectDownloadLink.click(),
  ]);
  // `download.path()` points at Playwright's internal download cache, which
  // doesn't preserve the ".pdf" extension — re-uploading that path makes the
  // browser send an empty/octet-stream MIME type, which the upload route's
  // magic-byte + declared-MIME check correctly rejects. `saveAs` lets us
  // control the extension so the round-trip re-upload looks like a real
  // user picking a genuine .pdf file.
  const protectedPath = path.join(tmpdir(), `jdpdf-protected-${Date.now()}.pdf`);
  await protectedDownload.saveAs(protectedPath);

  await page.goto("/en/unlock-pdf");
  await page.locator('input[type="file"]').setInputFiles([protectedPath]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });

  await page.getByLabel("Current password").fill(WRONG_PASSWORD);
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("That password is incorrect.")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByRole("button", { name: "Retry" }).click();

  const unlockDownloadLink = page.getByRole("link", { name: "Download" });
  await expect(unlockDownloadLink).toBeVisible({ timeout: 30_000 });
  const [unlockedDownload] = await Promise.all([
    page.waitForEvent("download"),
    unlockDownloadLink.click(),
  ]);
  const unlockedPath = await unlockedDownload.path();
  expect(unlockedPath).not.toBeNull();

  const unlockedBytes = await readFile(unlockedPath as string);
  const pageTexts = await extractFirstLinePerPage(unlockedBytes);
  expect(pageTexts).toEqual([
    "Fixture-B - page 1",
    "Fixture-B - page 2",
    "Fixture-B - page 3",
  ]);
});
