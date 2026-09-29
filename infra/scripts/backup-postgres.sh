#!/bin/sh
# Logical Postgres backup (plan §18.3). Runs once, or daily with --loop (the compose `backup` service).
#   PGHOST/PGUSER/PGDATABASE/PGPASSWORD   standard libpq variables
#   BACKUP_DIR         default /backups
#   BACKUP_KEEP_DAYS   default 14
#   BACKUP_HOUR_UTC    hour to run in --loop mode, default 20 (01:30 IST is close enough)
#   BACKUP_S3_URI      optional, e.g. s3://namma-seva-backups/prod (needs the aws CLI in the image)
# Each dump is a custom-format archive plus a SHA-256 file; `restore-test.sh` proves it restores.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

backup_once() {
  mkdir -p "$BACKUP_DIR"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  file="$BACKUP_DIR/nammaseva-$stamp.dump"
  tmp="$file.partial"
  pg_dump --format=custom --compress=6 --no-owner --file="$tmp"
  mv "$tmp" "$file"
  (cd "$BACKUP_DIR" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
  echo "backup ok: $file ($(du -h "$file" | cut -f1))"
  if [ -n "${BACKUP_S3_URI:-}" ]; then
    aws s3 cp "$file" "$BACKUP_S3_URI/" && aws s3 cp "$file.sha256" "$BACKUP_S3_URI/"
  fi
  find "$BACKUP_DIR" -name 'nammaseva-*.dump*' -mtime "+$KEEP_DAYS" -delete
}

if [ "${1:-}" = "--loop" ]; then
  hour="${BACKUP_HOUR_UTC:-20}"
  while true; do
    now_h="$(date -u +%H | sed 's/^0//')"
    now_m="$(date -u +%M | sed 's/^0//')"
    # sleep until the next HH:00 UTC matching BACKUP_HOUR_UTC
    wait_h=$(( (hour - now_h + 24) % 24 ))
    wait_s=$(( wait_h * 3600 - now_m * 60 ))
    [ "$wait_s" -le 0 ] && wait_s=$(( wait_s + 86400 ))
    echo "next backup in ${wait_s}s"
    sleep "$wait_s"
    backup_once || echo "BACKUP FAILED" >&2
  done
else
  backup_once
fi
