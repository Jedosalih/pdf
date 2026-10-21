#!/bin/sh
# One-shot (docker-compose.prod.yml `storage-init`): creates the bucket
# through SeaweedFS's admin shell (master API, internal network only).
# Idempotent: an existing bucket is left as is.
set -eu
: "${STORAGE_BUCKET:?STORAGE_BUCKET is not set}"

if echo "s3.bucket.list" | weed shell -master=storage:9333 2>/dev/null | grep -qw "$STORAGE_BUCKET"; then
  echo "create-bucket: $STORAGE_BUCKET already exists"
  exit 0
fi
echo "s3.bucket.create -name $STORAGE_BUCKET" | weed shell -master=storage:9333
echo "s3.bucket.list" | weed shell -master=storage:9333 | grep -qw "$STORAGE_BUCKET"
echo "create-bucket: $STORAGE_BUCKET created"
