import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomTestIp, uploadFile } from "./helpers/api";

const fixture = path.join(__dirname, "../../docs/fixtures/sample-a-2page.pdf");

/**
 * Downloads go through a signed object-storage URL whose
 * Content-Disposition comes from lib/storage/contentDisposition.ts. An
 * Arabic/Turkish filename must arrive as a real RFC 5987 `filename*`
 * (which browsers decode), not percent-escapes inside `filename="..."`.
 */
test("an Arabic/Turkish filename downloads with a standards-compliant Content-Disposition", async ({
  request,
}) => {
  const ip = randomTestIp();
  const name = "تقرير-şğı.pdf";
  const upload = await uploadFile(
    request,
    "compress-pdf",
    { name, mimeType: "application/pdf", buffer: await readFile(fixture) },
    ip,
  );
  expect(upload.status()).toBe(200);
  const { fileId } = await upload.json();

  const redirect = await request.get(`/api/files/${fileId}/download`, {
    maxRedirects: 0,
    headers: { "x-forwarded-for": ip },
  });
  expect(redirect.status()).toBeGreaterThanOrEqual(300);
  expect(redirect.status()).toBeLessThan(400);

  const signed = await request.get(redirect.headers()["location"]!);
  expect(signed.ok()).toBe(true);
  const disposition = signed.headers()["content-disposition"]!;
  expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
  expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]+"/);
});
