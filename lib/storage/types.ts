export interface StorageProvider {
  /** Confirms the bucket is reachable and credentials are valid, without
   * reading/writing any object — used by /api/health, not by any
   * user-facing flow. */
  headBucket(): Promise<void>;
  putObject(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
  ): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  getSignedDownloadUrl(
    key: string,
    options?: { expiresInSeconds?: number; downloadFilename?: string },
  ): Promise<string>;
}
