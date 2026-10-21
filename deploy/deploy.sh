#!/bin/sh
# Deploys one exact, CI-tested commit on the production host (called over
# SSH by .github/workflows/deploy.yml, or by hand).
#
#   ./deploy/deploy.sh <40-character git SHA>
#
# 1. backup  2. check out the commit  3. build + start, waiting for every
# health check  4. verify the public health endpoint  5. on any failure,
# check the previous commit back out and restart it.
#
# Migrations only move forward: a rollback restarts the previous code on
# the already-migrated database, so every migration must stay compatible
# with the previous release (add columns/tables; drop in a later
# release). If a migration itself is the problem, restore the pre-deploy
# backup (docs/DEPLOYMENT.md).
set -eu
cd "$(dirname "$0")/.."

sha=${1:-}
case "$sha" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) ;;
  *) echo "deploy: expected a full commit SHA" >&2; exit 1 ;;
esac
[ "${#sha}" -eq 40 ] || { echo "deploy: expected a full 40-character SHA" >&2; exit 1; }

env_file=${ENV_FILE:-.env.production}
compose() { docker compose -f docker-compose.prod.yml --env-file "$env_file" "$@"; }
domain=$(sed -n 's/^APP_DOMAIN="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$env_file")

healthy() {
  i=0
  while [ "$i" -lt 30 ]; do
    if curl -fsS --max-time 10 --resolve "$domain:443:127.0.0.1" "https://$domain/api/health" | grep -q '"ok"'; then
      return 0
    fi
    i=$((i + 1))
    sleep 5
  done
  return 1
}

previous=$(git rev-parse HEAD)
./deploy/backup.sh "pre-deploy-$(echo "$previous" | cut -c1-12)"

git fetch --quiet origin
git cat-file -e "$sha^{commit}"
git checkout --quiet --detach "$sha"

if compose up -d --build --remove-orphans --wait --wait-timeout 900 && healthy; then
  echo "deploy: $sha is live"
  # Old image layers from previous builds; set DEPLOY_PRUNE=0 to keep them.
  [ "${DEPLOY_PRUNE:-1}" = 1 ] && docker image prune -f >/dev/null
  exit 0
fi

echo "deploy: $sha failed its health checks; rolling back to $previous" >&2
compose logs --tail 100 app migrate >&2 || true
git checkout --quiet --detach "$previous"
compose up -d --build --remove-orphans --wait --wait-timeout 900 && healthy \
  && echo "deploy: rolled back to $previous" >&2 \
  || echo "deploy: ROLLBACK ALSO FAILED -- restore from backups/ (docs/DEPLOYMENT.md)" >&2
exit 1
