#!/bin/sh
# Backs up the production database and object storage on the Docker host.
#
#   ./deploy/backup.sh [label]        # e.g. from cron, or before a deploy
#
# Writes backups/<label>-<UTC timestamp>/{postgres.sql.gz,storage.tar.gz}
# next to the repository checkout and keeps the newest $BACKUP_KEEP (14)
# backups. Copy the backups/ directory off the host regularly -- a backup
# on the same disk does not survive losing that disk. Restore steps:
# docs/DEPLOYMENT.md.
set -eu
cd "$(dirname "$0")/.."

label=${1:-scheduled}
case "$label" in *[!A-Za-z0-9._-]*) echo "backup: invalid label" >&2; exit 1 ;; esac
keep=${BACKUP_KEEP:-14}
dest="backups/${label}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$dest"
chmod 700 backups "$dest"

compose() { docker compose -f docker-compose.prod.yml --env-file "${ENV_FILE:-.env.production}" "$@"; }

fail() { echo "backup: FAILED: $1" >&2; rm -rf "$dest"; exit 1; }

# Consistent logical dump (pg_dump runs inside a single snapshot). Written
# to a file first, not piped: POSIX sh has no pipefail, so "pg_dump | gzip"
# would report success with an empty dump if pg_dump failed.
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' > "$dest/postgres.sql"   || fail "pg_dump"
grep -q "PostgreSQL database dump complete" "$dest/postgres.sql" || fail "pg_dump output incomplete"
gzip "$dest/postgres.sql"

# Object storage: archive of the SeaweedFS data directory, streamed out of
# the running container (to a file, then verified). SeaweedFS volumes are
# append-only, so a live copy is at worst missing writes made during the
# copy; schedule backups for a quiet hour.
compose exec -T storage tar czf - -C /data . > "$dest/storage.tar.gz" || fail "storage archive"
gzip -t "$dest/storage.tar.gz" || fail "storage archive is corrupt"

ls -1d backups/*/ | sort | head -n "-$keep" | xargs -r rm -rf
echo "backup: $dest ($(du -sh "$dest" | cut -f1))"
