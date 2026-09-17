import { connect } from "node:net";

export type ScanResult = "clean" | "infected" | "skipped";

const CLAMD_HOST = process.env.CLAMD_HOST;
const CLAMD_PORT = Number(process.env.CLAMD_PORT ?? 3310);
const CONNECT_TIMEOUT_MS = 5_000;
const SCAN_TIMEOUT_MS = 20_000;
const CHUNK_SIZE = 64 * 1024;

/**
 * Scans a buffer for malware via a running ClamAV daemon's `INSTREAM`
 * protocol (a small, well-documented wire protocol -- hand-rolled over a
 * raw socket rather than adding a third-party client dependency, most of
 * which are thin, sparsely-maintained wrappers around this exact same
 * protocol): connect, send `zINSTREAM\0`, then the file as
 * length-prefixed chunks (4-byte big-endian size + that many bytes),
 * terminated by a zero-length chunk, then read clamd's one-line reply.
 *
 * Returns `"skipped"` -- not `"clean"` -- if no scanner is configured
 * (`CLAMD_HOST` unset, e.g. in a dev/CI environment without the `clamav`
 * Compose service) or if the scanner is unreachable/errors/times out.
 * This is a deliberate fail-*open* choice: malware scanning here is one
 * defense-in-depth layer on top of the existing structural validation
 * (magic bytes, size, page count), not the only gate, so a transient
 * scanner outage should not take down the entire upload path for every
 * user. See `docs/SECURITY.md` §9 for this trade-off stated explicitly.
 */
export async function scanFile(buffer: Buffer): Promise<ScanResult> {
  if (!CLAMD_HOST) {
    return "skipped";
  }

  return new Promise((resolve) => {
    const socket = connect({ host: CLAMD_HOST, port: CLAMD_PORT });
    let settled = false;
    let response = "";

    const finish = (result: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("timeout", () => finish("skipped"));
    socket.once("error", () => finish("skipped"));

    socket.once("connect", () => {
      socket.setTimeout(SCAN_TIMEOUT_MS);
      socket.write("zINSTREAM\0");

      let offset = 0;
      while (offset < buffer.byteLength) {
        const end = Math.min(offset + CHUNK_SIZE, buffer.byteLength);
        const chunk = buffer.subarray(offset, end);
        const sizeHeader = Buffer.alloc(4);
        sizeHeader.writeUInt32BE(chunk.byteLength, 0);
        socket.write(sizeHeader);
        socket.write(chunk);
        offset = end;
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk signals EOF
    });

    socket.on("data", (chunk) => {
      response += chunk.toString("utf-8");
    });

    socket.once("close", () => {
      if (settled) return;
      settled = true;
      if (response.includes("FOUND")) {
        resolve("infected");
      } else if (response.includes("OK")) {
        resolve("clean");
      } else {
        // Any other/garbled reply is treated as inconclusive, not
        // "clean" -- but per the fail-open policy above, inconclusive
        // still means "skipped," not a rejection.
        resolve("skipped");
      }
    });
  });
}
