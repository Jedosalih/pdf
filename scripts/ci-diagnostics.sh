#!/bin/sh
# Publishes docker-compose state as GitHub Actions annotations after a
# failed or cancelled CI job. Downloading job logs needs repo-admin rights;
# annotations are visible to anyone who can see the run.
docker compose ps -a --format '{{.Name}} {{.Status}}' | while read -r line; do
  echo "::warning title=container::$line"
done
for c in $(docker compose ps -a --format '{{.Name}}|{{.Status}}' | grep -v -E '\(healthy\)|Exited \(0\)' | cut -d'|' -f1); do
  tail=$(docker logs --tail 15 "$c" 2>&1 | tr '\n' ' ' | cut -c1-900)
  echo "::error title=logs $c::$tail"
done
docker compose logs --tail 200
