#!/bin/sh
# Runs once, when the production Postgres volume is first initialized
# (/docker-entrypoint-initdb.d). Creates one login role per service so a
# compromised worker can't read sessions/users or drop tables. Table
# grants are applied after every migration by deploy/postgres/grants.sql
# (tables don't exist yet at this point). Passwords come from the
# environment (.env.production), never from this file.
set -eu

for var in POSTGRES_APP_PASSWORD POSTGRES_WORKER_PASSWORD POSTGRES_CLEANUP_PASSWORD; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    echo "init-roles: $var is not set" >&2
    exit 1
  fi
done

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$POSTGRES_APP_PASSWORD" \
  -v worker_pw="$POSTGRES_WORKER_PASSWORD" \
  -v cleanup_pw="$POSTGRES_CLEANUP_PASSWORD" <<'SQL'
CREATE ROLE jpdf_app LOGIN PASSWORD :'app_pw';
CREATE ROLE jpdf_worker LOGIN PASSWORD :'worker_pw';
CREATE ROLE jpdf_cleanup LOGIN PASSWORD :'cleanup_pw';
GRANT CONNECT ON DATABASE :"DBNAME" TO jpdf_app, jpdf_worker, jpdf_cleanup;
GRANT USAGE ON SCHEMA public TO jpdf_app, jpdf_worker, jpdf_cleanup;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
