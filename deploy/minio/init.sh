#!/bin/sh
# One-shot init for production MinIO (docker-compose.prod.yml): creates
# the bucket and one access key per service, each limited to what that
# service's code does (docs/DEPLOYMENT.md). Idempotent. Credentials come
# from the environment, never from this file. The root credentials are
# only used here, never by the app or workers.
set -eu

mc alias set prod http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "prod/$STORAGE_BUCKET"
# No anonymous access: every download goes through a signed URL.
mc anonymous set none "prod/$STORAGE_BUCKET"

policy() {
  name=$1
  file=/tmp/$name.json
  cat > "$file"
  mc admin policy create prod "$name" "$file" >/dev/null 2>&1 || mc admin policy update prod "$name" "$file" >/dev/null 2>&1 || true
}

policy jpdf-app <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:ListBucket"],"Resource":["arn:aws:s3:::$STORAGE_BUCKET"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::$STORAGE_BUCKET/*"]}]}
EOF

policy jpdf-worker <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetObject"],"Resource":["arn:aws:s3:::$STORAGE_BUCKET/*"]},
 {"Effect":"Allow","Action":["s3:PutObject"],"Resource":["arn:aws:s3:::$STORAGE_BUCKET/results/*"]}]}
EOF

policy jpdf-cleanup <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:DeleteObject"],"Resource":["arn:aws:s3:::$STORAGE_BUCKET/*"]}]}
EOF

user() {
  mc admin user add prod "$1" "$2" >/dev/null
  mc admin policy attach prod "$3" --user "$1" >/dev/null 2>&1 || true
}

user "$STORAGE_APP_ACCESS_KEY" "$STORAGE_APP_SECRET_KEY" jpdf-app
user "$STORAGE_WORKER_ACCESS_KEY" "$STORAGE_WORKER_SECRET_KEY" jpdf-worker
user "$STORAGE_CLEANUP_ACCESS_KEY" "$STORAGE_CLEANUP_SECRET_KEY" jpdf-cleanup
echo "minio init: bucket and scoped users ready"
