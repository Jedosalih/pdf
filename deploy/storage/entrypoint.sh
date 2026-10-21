#!/bin/sh
# Entrypoint for the SeaweedFS `storage` service (docker-compose.yml and
# docker-compose.prod.yml). Starts the server, then makes sure the bucket
# exists, and only then marks the container ready -- the healthcheck tests
# for /tmp/storage-ready. Services that need storage wait for
# `service_healthy` on this one container instead of on a separate
# one-shot init container (CI showed `compose up` hanging forever on such a
# one-shot: dependents stayed "Created").
#
# Env: STORAGE_BUCKET (required); S3_CONFIG (path of the identity file);
# RENDER_S3_CONFIG=1 renders S3_CONFIG from the STORAGE_*_KEY variables
# first (production, deploy/storage/render-s3-config.sh).
set -eu
: "${STORAGE_BUCKET:?STORAGE_BUCKET is not set}"
: "${S3_CONFIG:?S3_CONFIG is not set}"
rm -f /tmp/storage-ready

if [ "${RENDER_S3_CONFIG:-0}" = 1 ]; then
  S3_CONFIG_OUT="$S3_CONFIG" sh /render-s3-config.sh
fi

# -volume.max / -master.volumeSizeLimitMB: the image's own entrypoint
# defaults for `server`, which this script replaces.
weed -logtostderr=true server -dir=/data -volume.max=0 -master.volumeSizeLimitMB=1024 \
  -s3 -s3.port=8333 -s3.config="$S3_CONFIG" &
server=$!
trap 'kill "$server" 2>/dev/null; wait "$server"' TERM INT

# Bound every admin-shell call: an unready master must not block forever.
command -v timeout >/dev/null 2>&1 || timeout() { shift; "$@"; }
shell() { echo "$1" | timeout 20 weed shell -master=localhost:9333 2>/dev/null; }

attempt=0
until shell "s3.bucket.list" | grep -qw "$STORAGE_BUCKET"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 60 ] || ! kill -0 "$server" 2>/dev/null; then
    echo "storage: could not create bucket $STORAGE_BUCKET" >&2
    kill "$server" 2>/dev/null || true
    exit 1
  fi
  shell "s3.bucket.create -name $STORAGE_BUCKET" >/dev/null || true
  sleep 2
done
echo "storage: bucket $STORAGE_BUCKET ready"
touch /tmp/storage-ready

wait "$server"
