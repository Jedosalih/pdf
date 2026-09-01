import { createS3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

let provider: StorageProvider | undefined;

/**
 * Single storage entry point. All engines (MinIO locally, R2/S3 in
 * production) speak the S3 API, so one provider implementation covers
 * both — only the endpoint/credentials env vars change. See
 * docs/ARCHITECTURE.md.
 */
export function getStorage(): StorageProvider {
  if (!provider) {
    provider = createS3StorageProvider();
  }
  return provider;
}

export function generateStorageKey(prefix: string, extension: string): string {
  const id = crypto.randomUUID();
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `${prefix}/${id}${safeExt ? `.${safeExt}` : ""}`;
}

export type { StorageProvider } from "./types";
