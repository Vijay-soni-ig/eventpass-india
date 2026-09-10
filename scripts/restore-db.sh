#!/usr/bin/env bash
set -Eeuo pipefail

# Restore helper. Always prefer an isolated recovery database first.
# Invoke with: bash scripts/restore-db.sh /path/to/backup.dump
# Required: DATABASE_URL. Production restore additionally requires
# CONFIRM_PRODUCTION_RESTORE=YES.

BACKUP_FILE="${1:-}"
: "${DATABASE_URL:?DATABASE_URL is required}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: bash scripts/restore-db.sh /path/to/backup.dump" >&2
  exit 2
fi

command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required" >&2; exit 127; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 127; }

if [ -f "${BACKUP_FILE}.sha256" ]; then
  sha256sum --check "${BACKUP_FILE}.sha256"
else
  echo "WARNING: no checksum file found beside backup; continuing only because restore was explicitly requested." >&2
fi

DB_NAME="$(printf '%s' "$DATABASE_URL" | sed -nE 's#^.*/([^/?]+)(\?.*)?$#\1#p')"
if [ "$DB_NAME" = "" ]; then
  echo "Unable to determine target database name from DATABASE_URL" >&2
  exit 2
fi

if [ "${NODE_ENV:-}" = "production" ] && [ "${CONFIRM_PRODUCTION_RESTORE:-}" != "YES" ]; then
  echo "Refusing production restore. Set CONFIRM_PRODUCTION_RESTORE=YES only after validating the recovery plan." >&2
  exit 3
fi

if [ "${NODE_ENV:-}" = "production" ]; then
  echo "WARNING: restoring into production database '$DB_NAME'. Existing application data may be replaced." >&2
  [ "${CONFIRM_PRODUCTION_RESTORE:-}" = "YES" ] || exit 3
fi

# --clean removes objects present in the dump before recreation. The database
# itself is not dropped, so this works with managed PostgreSQL databases.
pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$BACKUP_FILE"

printf 'Restore completed successfully for database: %s\n' "$DB_NAME"
