#!/usr/bin/env bash
set -Eeuo pipefail

# Production PostgreSQL backup helper. Invoke with: bash scripts/backup-db.sh [output-dir]
# Required: DATABASE_URL. Optional: BACKUP_DIR, BACKUP_RETENTION_DAYS.

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups/postgres}}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required" >&2; exit 127; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 127; }

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$RETENTION_DAYS" -lt 1 ]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 2
fi

umask 077
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
HOSTNAME_PART="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^:]+://([^/@]+@)?([^/:]+).*#\2#')"
HOSTNAME_PART="${HOSTNAME_PART:-postgres}"
BACKUP_FILE="$BACKUP_DIR/exhibittix-${HOSTNAME_PART}-${STAMP}.dump"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

# Custom format is compressed by pg_dump and supports selective/ordered restore.
# Do not include database ownership/ACLs; the target environment owns those.
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$BACKUP_FILE"

sha256sum "$BACKUP_FILE" > "$CHECKSUM_FILE"

# Remove only backups older than the configured retention period.
find "$BACKUP_DIR" -type f \( -name 'exhibittix-*.dump' -o -name 'exhibittix-*.dump.sha256' \) \
  -mtime "+$RETENTION_DAYS" -delete

printf 'Backup created: %s\nChecksum: %s\n' "$BACKUP_FILE" "$CHECKSUM_FILE"
