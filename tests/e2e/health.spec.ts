import { test, expect } from "@playwright/test";

/**
 * A deploy workflow's health check needs to mean "actually serving real
 * requests," not just "the process started" — this verifies the endpoint
 * really does reach Postgres/Redis/storage, not just returns a canned
 * "ok".
 */
test("the health endpoint reports all real dependencies reachable", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const body = (await response.json()) as { status: string; checks: Record<string, boolean> };
  expect(body.status).toBe("ok");
  expect(body.checks.database).toBe(true);
  expect(body.checks.redis).toBe(true);
  expect(body.checks.storage).toBe(true);
});
