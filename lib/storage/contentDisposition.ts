/**
 * RFC 6266 `Content-Disposition: attachment` for an arbitrary (user-
 * supplied, possibly Arabic/Turkish) filename. Browsers that understand
 * `filename*` (RFC 5987, UTF-8, percent-encoded) use it and show the real
 * name; the plain `filename` is an ASCII-only fallback for the rest.
 * Percent-encoding inside the quoted `filename="..."` -- what this
 * replaced -- is not decoded by browsers, so non-ASCII names downloaded
 * as literal `%D8%A7...` strings.
 */
export function attachmentDisposition(filename: string): string {
  const cleaned = filename.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "download";
  const asciiFallback = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
