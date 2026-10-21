// CI readiness check: does what the app (running on the host) does with
// object storage -- head the bucket, put, get, delete -- using the same
// client settings as lib/storage/s3.ts and the env from .env. Fails fast
// with the exact error as a GitHub annotation instead of letting every
// upload in the E2E suite time out.
//
//   node --env-file=.env scripts/ci-storage-probe.mjs
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const bucket = process.env.STORAGE_BUCKET;
const client = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT,
  region: process.env.STORAGE_REGION ?? "auto",
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
    secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
  },
});
const key = `ci-probe/${Date.now()}.txt`;

function describe(error) {
  const parts = [error.name, error.code, error.$metadata?.httpStatusCode, error.message];
  for (const inner of error.errors ?? [error.cause].filter(Boolean)) {
    parts.push(`[${inner.code ?? inner.name}: ${inner.message}]`);
  }
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 900);
}

const steps = [
  ["head bucket", () => client.send(new HeadBucketCommand({ Bucket: bucket }))],
  ["put", () => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "probe", ContentType: "text/plain" }))],
  ["get", async () => {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await result.Body?.transformToString();
    if (body !== "probe") throw new Error(`unexpected body (${body?.length ?? 0} bytes)`);
  }],
  ["delete", () => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))],
];

for (const [name, run] of steps) {
  const started = Date.now();
  try {
    await run();
    console.log(`ok: ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    console.log(`::error title=storage probe: ${name}::${describe(error)}`);
    process.exit(1);
  }
}
