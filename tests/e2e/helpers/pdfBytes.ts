import { inflateSync } from "node:zlib";

/**
 * The PDF's raw bytes plus every Flate stream inflated, as one latin1
 * string. Text extraction only sees what a page draws; this also sees
 * unreferenced objects, metadata streams, attachments and annotation
 * strings -- where the original redaction bug actually leaked.
 */
export function decodedPdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const parts = [raw];
  const streamStart = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamStart.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    try {
      parts.push(inflateSync(bytes.subarray(start, end)).toString("latin1"));
    } catch {
      // not Flate-encoded (or not a stream at all) -- raw bytes already included
    }
  }
  return parts.join("\n");
}

/** Raw, hex (both cases) and UTF-16BE forms -- how PDF writers encode text
 * in content streams (pdf-lib hex-encodes glyph codes), Info strings and
 * annotation contents. */
export function containsPdfString(haystack: string, marker: string): boolean {
  const ascii = Buffer.from(marker, "latin1");
  const utf16 = Buffer.concat([...marker].map((c) => Buffer.from([0, c.charCodeAt(0)])));
  return [
    marker,
    ascii.toString("hex").toUpperCase(),
    ascii.toString("hex"),
    utf16.toString("latin1"),
    utf16.toString("hex").toUpperCase(),
    utf16.toString("hex"),
  ].some((form) => haystack.includes(form));
}
