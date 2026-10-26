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

CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
  # Compare hashes directly instead of trusting the path embedded by sha256sum:
  # backups may be restored from a different working directory or mount point.
  EXPECTED_CHECKSUM="$(awk 'NR == 1 { print $1 }' "$CHECKSUM_FILE")"
  if ! [[ "$EXPECTED_CHECKSUM" =~ ^[[:xdigit:]]{64}$ ]]; then
    echo "Invalid SHA-256 checksum file: $CHECKSUM_FILE" >&2
    exit 4
  fi

  ACTUAL_CHECKSUM="$(sha256sum "$BACKUP_FILE" | awk '{ print $1 }')"
  if [ "$ACTUAL_CHECKSUM" != "$EXPECTED_CHECKSUM" ]; then
    echo "Backup checksum verification failed: $BACKUP_FILE" >&2
    exit 4
  fi
else
  if [ "${NODE_ENV:-}" = "production" ]; then
    echo "Refusing production restore without a SHA-256 checksum file: $CHECKSUM_FILE" >&2
    exit 4
  fi
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
