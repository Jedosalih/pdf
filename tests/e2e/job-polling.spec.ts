import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");
const JOB_STATUS_URL = /\/api\/jobs\/[^/?]+$/;

/**
 * The client polling loop (components/tools/useToolWorkflow.ts): transient
 * network/5xx errors are retried, a 4xx ends polling, and a job that never
 * finishes stops polling at a deadline with an honest message instead of
 * spinning forever.
 */
async function startCompress(page: Page) {
  await page.goto("/en/compress-pdf");
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole("button", { name: "Start" }).click();
}

test("polling survives transient network failures and still delivers the result", async ({ page }) => {
  let failuresLeft = 2;
  await page.route(JOB_STATUS_URL, async (route) => {
    if (route.request().method() === "GET" && failuresLeft > 0) {
      failuresLeft -= 1;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  await startCompress(page);
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 30_000 });
  expect(failuresLeft).toBe(0);
});

test("a 4xx job-status response ends polling with an error", async ({ page }) => {
  await page.route(JOB_STATUS_URL, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":{"code":"NOT_FOUND"}}' }),
  );
  await startCompress(page);
  await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible({ timeout: 15_000 });
});

test("a job that never finishes stops polling at the deadline", async ({ page }) => {
  await page.clock.install();
  let polls = 0;
  await page.route(JOB_STATUS_URL, (route) => {
    polls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "x", status: "QUEUED", progress: 0, errorCode: null, outputFiles: [] }),
    });
  });

  await startCompress(page);
  await expect.poll(() => polls, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.clock.fastForward("16:00");
  await expect(page.getByText("This is taking longer than expected. Please try again later.")).toBeVisible({
    timeout: 15_000,
  });

  // No further polling once it has given up.
  const pollsAtTimeout = polls;
  await page.clock.fastForward("01:00");
  await page.waitForTimeout(500);
  expect(polls).toBe(pollsAtTimeout);
});
