#!/bin/sh
# Weekly restore drill (plan §18.3): restore the newest backup into a throw-away Postgres and check
# that the data is really there. Exit non-zero on any failure so the scheduler alerts.
#   BACKUP_DIR   directory holding nammaseva-*.dump (default ./backups)
#   BACKUP_FILE  restore this file instead of the newest
# Needs Docker. On success prints a one-line JSON summary suitable for the drill log.
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
FILE="${BACKUP_FILE:-$(ls -1t "$BACKUP_DIR"/nammaseva-*.dump 2>/dev/null | head -1)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "no backup found in $BACKUP_DIR" >&2; exit 1; }

if [ -f "$FILE.sha256" ]; then
  (cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256") >/dev/null || { echo "checksum mismatch: $FILE" >&2; exit 1; }
fi

NAME="ns-restore-test-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=restore postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres -d restore >/dev/null 2>&1 && break
  sleep 1
done
docker cp "$FILE" "$NAME:/tmp/restore.dump"
docker exec "$NAME" pg_restore --no-owner --exit-on-error -U postgres -d restore /tmp/restore.dump

q() { docker exec "$NAME" psql -U postgres -d restore -Atc "$1"; }
projects="$(q 'select count(*) from projects')"
events="$(q 'select count(*) from chain_events')"
migrations="$(q 'select count(*) from drizzle.__drizzle_migrations')"
cursor="$(q "select coalesce(max(last_block), -1) from indexer_cursor")"

# The chain is the source of truth: a backup with zero indexed events on a live network is suspect.
[ "$migrations" -ge 1 ] || { echo "restore produced no migrations table rows" >&2; exit 1; }
echo "{\"restored\":\"$(basename "$FILE")\",\"projects\":$projects,\"chainEvents\":$events,\"migrations\":$migrations,\"indexedToBlock\":$cursor}"
