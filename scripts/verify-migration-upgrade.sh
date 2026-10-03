#!/usr/bin/env bash
# Proves the migrations in this checkout apply to a database that already holds data.
#
# CI otherwise only applies every migration to an empty database, where a migration that
# fails on existing rows (for example one that uses an enum value it just added, or adds a
# NOT NULL column without a default) passes. This script instead:
#   1. builds the schema from <base-ref>'s migrations and fills it with <base-ref>'s seed plus its
#      Event backfill, so events linked to exhibitions exist (the shape that broke 001f),
#   2. applies this checkout's migrations on top of that populated database,
#   3. checks the migration state and that schema.prisma still matches the database.
#
# Usage: MIGRATION_UPGRADE_THROWAWAY=1 DATABASE_URL=... scripts/verify-migration-upgrade.sh <base-ref>
# The database is modified (and should be empty to start), so it must be a throwaway one.
# SKIP_PRISMA_GENERATE=1 skips regenerating the client, for a local run where something (such as
# a running dev server on Windows) has the Prisma engine locked and the schemas are unchanged.
set -euo pipefail

BASE_REF="${1:?usage: verify-migration-upgrade.sh <base-ref>, for example origin/main}"
: "${DATABASE_URL:?DATABASE_URL must point at a throwaway database}"
if [ "${MIGRATION_UPGRADE_THROWAWAY:-}" != "1" ]; then
  echo "Refusing to run: this applies migrations and seed data to \$DATABASE_URL." >&2
  echo "Set MIGRATION_UPGRADE_THROWAWAY=1 to confirm it is a throwaway database." >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
BASELINE="$ROOT/server/.migration-upgrade-baseline"
trap 'rm -rf "$BASELINE"' EXIT
rm -rf "$BASELINE"
mkdir -p "$BASELINE"

# Kept inside server/ so the baseline seed resolves the same node_modules.
git -C "$ROOT" archive "$BASE_REF" server/prisma server/src | tar -x -C "$BASELINE"
BASE_SCHEMA="$BASELINE/server/prisma/schema.prisma"

cd "$ROOT/server"
echo "== Baseline: migrations and seed from $BASE_REF"
[ "${SKIP_PRISMA_GENERATE:-}" = "1" ] || npx prisma generate --schema "$BASE_SCHEMA" >/dev/null
npx prisma migrate deploy --schema "$BASE_SCHEMA"
npx tsx "$BASELINE/server/prisma/seed.ts"
if [ -f "$BASELINE/server/prisma/backfillEvents.ts" ]; then
  npx tsx "$BASELINE/server/prisma/backfillEvents.ts"
fi

echo "== Upgrade: this checkout's migrations on the populated database"
[ "${SKIP_PRISMA_GENERATE:-}" = "1" ] || npx prisma generate >/dev/null
npx prisma migrate deploy
npx prisma migrate status
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
echo "Migration upgrade path OK."
