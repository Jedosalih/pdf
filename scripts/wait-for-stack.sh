#!/bin/sh
# Waits until the docker-compose.yml infrastructure is ready: postgres,
# redis, storage (healthy = bucket exists) and mailpit report healthy.
# Used by CI instead of `docker compose up --wait`, which treats workers
# restarting until migrations exist as failures.
#
#   scripts/wait-for-stack.sh [timeout-seconds]
set -eu
timeout=${1:-600}
elapsed=0

status() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}:{{.State.ExitCode}}{{end}}' "$1" 2>/dev/null || echo missing
}

while :; do
  pending=""
  for service in postgres redis storage mailpit; do
    [ "$(status "pdf-$service-1")" = healthy ] || pending="$pending $service"
  done
  if [ -z "$pending" ]; then
    echo "stack ready after ${elapsed}s"
    exit 0
  fi
  if [ "$elapsed" -ge "$timeout" ]; then
    echo "timed out after ${timeout}s waiting for:$pending"
    docker compose ps -a
    exit 1
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done
