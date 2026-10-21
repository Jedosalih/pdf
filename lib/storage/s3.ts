import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./types";
import { attachmentDisposition } from "./contentDisposition";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createS3StorageProvider(): StorageProvider {
  const bucket = requireEnv("STORAGE_BUCKET");
  const clientFor = (endpoint: string | undefined) =>
    new S3Client({
      endpoint,
      region: process.env.STORAGE_REGION ?? "auto",
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: requireEnv("STORAGE_ACCESS_KEY"),
        secretAccessKey: requireEnv("STORAGE_SECRET_KEY"),
      },
    });
  // All storage operations go to STORAGE_ENDPOINT (internal network in
  // production). Download URLs are signed for STORAGE_PUBLIC_ENDPOINT when
  // set -- the public HTTPS origin browsers fetch them from, which the
  // reverse proxy limits to GET/HEAD. A SigV4 signature covers the Host,
  // so the URL must be signed for the host the browser will actually use.
  const client = clientFor(process.env.STORAGE_ENDPOINT);
  const signingClient = process.env.STORAGE_PUBLIC_ENDPOINT
    ? clientFor(process.env.STORAGE_PUBLIC_ENDPOINT)
    : client;

  return {
    async headBucket() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },

    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async getObject(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes) {
        throw new Error(`Storage object not found: ${key}`);
      }
      // See workers/pdf/src/storage.ts for why this avoids Buffer.from's
      // pooled-allocation byteOffset gotcha.
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    },

    async deleteObject(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    },

    async getSignedDownloadUrl(key, options) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: options?.downloadFilename
          ? attachmentDisposition(options.downloadFilename)
          : undefined,
      });
      return getSignedUrl(signingClient, command, {
        expiresIn: options?.expiresInSeconds ?? 300,
      });
    },
  };
}
