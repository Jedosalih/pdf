-- Applied by the `migrate` service after every `prisma migrate deploy`
-- (docker-compose.prod.yml), as the owning admin role. Idempotent.
-- Derived from what each service's code actually does (docs/DEPLOYMENT.md):
--   app:     full DML on every table (no DDL -- migrations run as admin)
--   workers: read their job + its files, update the job, insert outputs
--   cleanup: expire/purge files, fail stale jobs
-- A table added by a future migration gets app access automatically via
-- the GRANT ... ON ALL TABLES below; worker/cleanup access must be added
-- here explicitly if they ever need it.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jpdf_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jpdf_app;

GRANT SELECT, UPDATE ON "Job" TO jpdf_worker;
GRANT SELECT, INSERT ON "File" TO jpdf_worker;

GRANT SELECT, UPDATE ON "Job" TO jpdf_cleanup;
GRANT SELECT, UPDATE, DELETE ON "File" TO jpdf_cleanup;
