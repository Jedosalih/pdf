import IORedis from "ioredis";

let connection: IORedis | undefined;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      { maxRetriesPerRequest: null },
    );
  }
  return connection;
}
