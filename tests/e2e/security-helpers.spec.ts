import { test, expect } from "@playwright/test";
import type { NextRequest } from "next/server";
import { readBodyWithLimit } from "@/lib/security/requestBody";
import { getClientIp } from "@/lib/security/clientIp";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { attachmentDisposition } from "@/lib/storage/contentDisposition";
import { getRedisConnection } from "@/lib/queue/connection";

/**
 * Unit-level coverage for the security helpers behind the abuse controls,
 * run directly (no browser). `checkRateLimit` runs against the real Redis
 * from the local stack, not a mock.
 */

test.afterAll(async () => {
  await getRedisConnection().quit();
});

function streamOf(totalBytes: number, chunkBytes = 64 * 1024): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) return controller.close();
      const size = Math.min(chunkBytes, totalBytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size));
    },
  });
}

function requestWith(body: ReadableStream<Uint8Array>, contentLength?: string): Request {
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return new Request("http://local/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

test("readBodyWithLimit refuses a declared Content-Length over the limit", async () => {
  expect(await readBodyWithLimit(requestWith(streamOf(10), "2000000"), 1000)).toBeNull();
});

test("readBodyWithLimit stops a body that lies about its Content-Length", async () => {
  expect(await readBodyWithLimit(requestWith(streamOf(2 * 1024 * 1024), "10"), 1024 * 1024)).toBeNull();
});

test("readBodyWithLimit stops a body with no Content-Length at all", async () => {
  expect(await readBodyWithLimit(requestWith(streamOf(2 * 1024 * 1024)), 1024 * 1024)).toBeNull();
});

test("readBodyWithLimit returns bodies within the limit intact", async () => {
  const body = await readBodyWithLimit(requestWith(streamOf(300_000, 7_000)), 300_000);
  expect(body?.byteLength).toBe(300_000);
});

function ipFor(header: string | null): string {
  const headers = new Headers();
  if (header !== null) headers.set("x-forwarded-for", header);
  return getClientIp({ headers } as unknown as NextRequest);
}

test("getClientIp trusts only the proxy-appended entry, never a client-supplied one", async () => {
  const previous = process.env.TRUSTED_PROXY_HOPS;
  try {
    delete process.env.TRUSTED_PROXY_HOPS;
    // One proxy appended the real address after whatever the client sent.
    expect(ipFor("6.6.6.6, 203.0.113.7")).toBe("203.0.113.7");
    expect(ipFor("203.0.113.7")).toBe("203.0.113.7");
    expect(ipFor(null)).toBe("unknown");
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(ipFor("6.6.6.6, 203.0.113.7, 10.0.0.2")).toBe("203.0.113.7");
  } finally {
    if (previous === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = previous;
  }
});

test("checkRateLimit allows exactly `limit` hits and always sets an expiry", async () => {
  const key = `test:${Date.now()}:${Math.random()}`;
  const results: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    results.push((await checkRateLimit(key, { limit: 3, windowSeconds: 60 })).allowed);
  }
  expect(results).toEqual([true, true, true, false]);
  const ttl = await getRedisConnection().ttl(`ratelimit:${key}`);
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(60);
  await getRedisConnection().del(`ratelimit:${key}`);
});

test("attachmentDisposition keeps Arabic/Turkish names readable and the header safe", async () => {
  const header = attachmentDisposition('تقرير "سري"\r\n-şğı.pdf');
  expect(header).not.toMatch(/[\r\n]/);
  expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('تقرير "سري"-şğı.pdf')}`);
  const fallback = /filename="([^"]*)"/.exec(header)![1]!;
  expect(fallback).toMatch(/^[\x20-\x7e]+$/);
  expect(fallback.endsWith(".pdf")).toBe(true);
  expect(attachmentDisposition("it's (final)*.pdf")).toContain("filename*=UTF-8''it%27s%20%28final%29%2A.pdf");
});
