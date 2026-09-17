import { test, expect } from "@playwright/test";
import path from "node:path";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");

/**
 * `tryReserveToolUsage` (lib/entitlements/index.ts) atomically checks and
 * records daily usage inside one Postgres transaction, guarded by a
 * transaction-scoped advisory lock — replacing a previous check-then-
 * write that let concurrent requests from the same actor all read the
 * same pre-increment count and all pass. This fires genuinely concurrent
 * job-creation requests (not sequential ones a race could hide) and
 * verifies *exactly* `dailyOperations` (8, for a guest on compress-pdf)
 * succeed, never more — proving the limit itself, not just that some
 * requests got rejected.
 */
test("concurrent job-creation requests cannot exceed the daily usage limit", async ({
  page,
}) => {
  await page.goto("/en/compress-pdf");
  const [uploadResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/upload") && res.status() === 200),
    page.locator('input[type="file"]').setInputFiles(fixture),
  ]);
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 20_000 });
  const { fileId } = (await uploadResponse.json()) as { fileId: string };

  const CONCURRENT_REQUESTS = 20;
  const EXPECTED_DAILY_LIMIT = 8;

  const responses = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, () =>
      page.request.post("/api/jobs", {
        data: { toolId: "compress-pdf", fileIds: [fileId], options: { level: "balanced" } },
      }),
    ),
  );

  const bodies = await Promise.all(responses.map((r) => r.json()));
  const succeeded = responses.filter((r) => r.status() === 200).length;
  const limited = bodies.filter(
    (b: { error?: { code: string } }) => b.error?.code === "DAILY_LIMIT_REACHED",
  ).length;

  expect(succeeded).toBe(EXPECTED_DAILY_LIMIT);
  expect(limited).toBe(CONCURRENT_REQUESTS - EXPECTED_DAILY_LIMIT);
});
