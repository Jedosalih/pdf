/**
 * Reads a request body into memory, but never more than `maxBytes` of it:
 * a declared `Content-Length` over the limit is refused before reading
 * anything, and the stream itself is counted as it arrives (and cancelled
 * the moment it passes the limit), so a caller that lies about or omits
 * `Content-Length` still can't make a route buffer more than the limit.
 * Returns `null` when the body is over the limit.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<Buffer | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}
