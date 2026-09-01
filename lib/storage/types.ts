export interface StorageProvider {
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
