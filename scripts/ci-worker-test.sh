#!/bin/sh
# Runs one worker-image test script in CI and, if it fails, publishes its
# failure lines as GitHub Actions annotations (job logs need repo-admin
# rights to download; annotations are visible on the run page).
#
#   scripts/ci-worker-test.sh <compose-service> <script-in-dist>
set -u
service=$1
script=$2
log=$(mktemp)

docker compose run --rm --no-deps "$service" node "dist/$script" >"$log" 2>&1
status=$?
cat "$log"
if [ "$status" -ne 0 ]; then
  grep -E 'FAIL|Error|error' "$log" | head -8 | cut -c1-900 \
    | sed "s/^/::error title=$service $script::/"
fi
rm -f "$log"
exit "$status"
