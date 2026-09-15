import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { prisma } from "@/lib/db/client";
import { isOwnedByActor, resolveActor } from "@/lib/security/actor";
import { getStorage } from "@/lib/storage";
import { apiError } from "@/lib/api/errors";

export const runtime = "nodejs";

const MAX_ZIP_FILES = 100;
const MAX_ZIP_TOTAL_BYTES = 200 * 1024 * 1024;

/**
 * Bundles a job's output files into a single ZIP for "download all" on
 * multi-output results (e.g. Split PDF). `StorageProvider` only exposes
 * whole-buffer reads (`getObject`) — true byte-streaming the input side
 * would need a bigger interface change across every worker handler, so
 * instead files are fetched one at a time (never via Promise.all) to avoid
 * an N-way concurrent memory spike, guarded by a hard file-count/size cap
 * for pathological cases. The output side IS streamed: JSZip's
 * `generateNodeStream` writes into the HTTP response as it compresses
 * rather than buffering the whole archive in memory first.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await resolveActor();

  const job = await prisma.job.findUnique({
    where: { id },
    include: { outputFiles: true },
  });
  if (!job) return apiError("NOT_FOUND");
  if (!isOwnedByActor(job, actor)) return apiError("FORBIDDEN");
  if (job.outputFiles.length === 0) return apiError("NOT_FOUND");

  if (job.outputFiles.length > MAX_ZIP_FILES) {
    return apiError("FILE_TOO_LARGE");
  }
  const totalBytes = job.outputFiles.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
    return apiError("FILE_TOO_LARGE");
  }

  const zip = new JSZip();
  const storage = getStorage();
  for (const file of job.outputFiles) {
    const buffer = await storage.getObject(file.storageKey);
    zip.file(file.originalName, buffer);
  }

  const nodeStream = zip.generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
  });

  return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="jdpdf-result.zip"',
    },
  });
}
