#!/bin/sh
# Publishes docker-compose state as GitHub Actions annotations after a
# failed or cancelled CI job (downloading job logs needs repo-admin rights;
# annotations are visible to anyone who can see the run). GitHub keeps at
# most 10 annotations of each level per step, so the container table is a
# single annotation and only problem containers get their own.
nl='
'
table=$(docker compose ps -a --format '{{.Name}}={{.Status}}' | tr "$nl" ';')
echo "::warning title=containers::$table"

# Containers that are neither healthy, nor running without a healthcheck,
# nor finished successfully.
docker compose ps -a --format '{{.Name}}|{{.Status}}' \
  | grep -v -F '(healthy)' \
  | grep -v -F 'Exited (0)' \
  | grep -v -E '[|]Up [0-9a-zA-Z ]+$' \
  | cut -d'|' -f1 | head -8 \
  | while read -r c; do
      tail=$(docker logs --tail 12 "$c" 2>&1 | tr "$nl" ' ' | cut -c1-900)
      echo "::error title=logs $c::${tail:-<no output>}"
    done

# Storage's routine output is noise (lock-ring updates); errors/warnings
# are glog lines starting E or W.
storage=$(docker logs pdf-storage-1 2>&1 | grep -E '^[EW][0-9]{4}' | tail -6 | tr "$nl" ' ' | cut -c1-900)
echo "::warning title=logs pdf-storage-1::${storage:-<no errors or warnings>}"

# The app runs on the host (started by CI into app.log).
if [ -f app.log ]; then
  app=$(grep -iE 'error|fail|refused|timeout' app.log | tail -6 | tr "$nl" ' ' | cut -c1-900)
  echo "::warning title=app log::${app:-<no errors>}"
fi

docker compose logs --tail 200
