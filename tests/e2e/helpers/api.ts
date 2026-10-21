import { expect, type APIRequestContext } from "@playwright/test";
import { randomInt } from "node:crypto";

/**
 * API-level helpers for tests that exercise server-side limits directly
 * (what an attacker's script would do), rather than through the UI.
 * Every request carries an `X-Forwarded-For` the caller picks, so each
 * test gets its own per-IP rate-limit buckets: in local dev/CI there is no
 * reverse proxy, so the rightmost entry is what `getClientIp` sees.
 */
export function randomTestIp(): string {
  return `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
}

export async function uploadFile(
  request: APIRequestContext,
  toolId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
  ip: string,
) {
  return request.post(`/api/upload?toolId=${encodeURIComponent(toolId)}`, {
    multipart: { file },
    headers: { "x-forwarded-for": ip },
  });
}

export async function createJob(
  request: APIRequestContext,
  body: { toolId: string; fileIds: string[]; options?: Record<string, unknown> },
  ip: string,
) {
  return request.post("/api/jobs", { data: body, headers: { "x-forwarded-for": ip } });
}

export async function waitForJob(request: APIRequestContext, jobId: string, ip: string) {
  let body: { status: string; errorCode: string | null; outputFiles: { id: string; name: string }[] } | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/jobs/${jobId}`, { headers: { "x-forwarded-for": ip } });
        body = await response.json();
        return body!.status;
      },
      { timeout: 60_000, intervals: [500, 1000] },
    )
    .toMatch(/COMPLETED|FAILED/);
  return body!;
}

export async function downloadFile(request: APIRequestContext, fileId: string, ip: string): Promise<Buffer> {
  const response = await request.get(`/api/files/${fileId}/download`, { headers: { "x-forwarded-for": ip } });
  expect(response.ok()).toBe(true);
  return Buffer.from(await response.body());
}

/** Upload + create + wait; returns the finished job. */
export async function runTool(
  request: APIRequestContext,
  toolId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
  options: Record<string, unknown>,
  ip: string,
) {
  const upload = await uploadFile(request, toolId, file, ip);
  expect(upload.status(), await upload.text()).toBe(200);
  const { fileId } = (await upload.json()) as { fileId: string };
  const job = await createJob(request, { toolId, fileIds: [fileId], options }, ip);
  expect(job.status(), await job.text()).toBe(200);
  const { jobId } = (await job.json()) as { jobId: string };
  return waitForJob(request, jobId, ip);
}
