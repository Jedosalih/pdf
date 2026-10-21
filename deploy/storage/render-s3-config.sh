#!/bin/sh
# Called by deploy/storage/entrypoint.sh in production (RENDER_S3_CONFIG=1):
# renders SeaweedFS's S3 identity file from the environment at startup, so
# no credential lives in the repository or in a shared volume. One least-privilege key per
# service, derived from what each service's code does (docs/DEPLOYMENT.md):
#   app      read/write/list the bucket (uploads, downloads, trash purge)
#   worker   read the bucket, write only under results/
#   cleanup  write (SeaweedFS "Write" = put + delete; no read access)
# Unauthenticated requests are refused: every download is a signed URL.
set -eu

for var in STORAGE_BUCKET STORAGE_APP_ACCESS_KEY STORAGE_APP_SECRET_KEY \
  STORAGE_WORKER_ACCESS_KEY STORAGE_WORKER_SECRET_KEY \
  STORAGE_CLEANUP_ACCESS_KEY STORAGE_CLEANUP_SECRET_KEY; do
  eval "value=\${$var:-}"
  case "$value" in
    "" ) echo "render-s3-config: $var is not set" >&2; exit 1 ;;
    *[!A-Za-z0-9_-]* ) echo "render-s3-config: $var must be [A-Za-z0-9_-] only" >&2; exit 1 ;;
  esac
done

out=${S3_CONFIG_OUT:-/config/s3.json}
mkdir -p "$(dirname "$out")"
cat > "$out" <<EOF
{
  "identities": [
    {
      "name": "app",
      "credentials": [{ "accessKey": "$STORAGE_APP_ACCESS_KEY", "secretKey": "$STORAGE_APP_SECRET_KEY" }],
      "actions": ["Read:$STORAGE_BUCKET", "Write:$STORAGE_BUCKET", "List:$STORAGE_BUCKET"]
    },
    {
      "name": "worker",
      "credentials": [{ "accessKey": "$STORAGE_WORKER_ACCESS_KEY", "secretKey": "$STORAGE_WORKER_SECRET_KEY" }],
      "actions": ["Read:$STORAGE_BUCKET", "Write:$STORAGE_BUCKET/results/*"]
    },
    {
      "name": "cleanup",
      "credentials": [{ "accessKey": "$STORAGE_CLEANUP_ACCESS_KEY", "secretKey": "$STORAGE_CLEANUP_SECRET_KEY" }],
      "actions": ["Write:$STORAGE_BUCKET"]
    }
  ]
}
EOF
# Only the storage container itself reads this file (it renders it into
# its own filesystem at startup), so it can be owner-only.
chmod 600 "$out"
echo "render-s3-config: identities written"
