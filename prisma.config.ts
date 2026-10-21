import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7: the CLI (generate/migrate/seed) reads its connection info from
// here, not from schema.prisma. Runtime PrismaClient instances configure
// their own connection separately via a driver adapter — see
// lib/db/client.ts and workers/pdf/src/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Only needed for `prisma migrate diff --from-migrations` (the CI
    // drift check); a scratch database Prisma may wipe freely.
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
