#!/usr/bin/env bash
set -Eeuo pipefail

# Regression tests for scripts/restore-db.sh. pg_restore is stubbed so no database
# connection or destructive operation can occur during this test.
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat > "$TMP/bin/pg_restore" <<'STUB'
#!/usr/bin/env bash
printf 'called\n' >> "$PG_RESTORE_LOG"
exit 0
STUB
chmod +x "$TMP/bin/pg_restore"

BACKUP="$TMP/backup.dump"
LOG="$TMP/pg_restore.log"
printf 'test backup bytes\n' > "$BACKUP"
export PATH="$TMP/bin:$PATH"
export DATABASE_URL='postgresql://test:test@localhost:5432/recovery_db'
export PG_RESTORE_LOG="$LOG"
export CONFIRM_PRODUCTION_RESTORE=YES
export NODE_ENV=production

assert_not_restored() {
  if [ -s "$LOG" ]; then
    echo "FAIL: pg_restore was invoked when restore should have been rejected" >&2
    exit 1
  fi
}

# Production must refuse a missing checksum before invoking pg_restore.
if bash "$ROOT/restore-db.sh" "$BACKUP" >"$TMP/missing.out" 2>&1; then
  echo "FAIL: production restore accepted a missing checksum" >&2
  exit 1
fi
grep -q 'without a SHA-256 checksum file' "$TMP/missing.out"
assert_not_restored
echo "PASS: production restore rejects a missing checksum"

# Production must refuse a malformed checksum.
printf 'not-a-checksum  backup.dump\n' > "\${BACKUP}.sha256"
if bash "$ROOT/restore-db.sh" "$BACKUP" >"$TMP/malformed.out" 2>&1; then
  echo "FAIL: production restore accepted a malformed checksum" >&2
  exit 1
fi
grep -q 'Invalid SHA-256 checksum file' "$TMP/malformed.out"
assert_not_restored
echo "PASS: production restore rejects a malformed checksum"

# Production must refuse a mismatched digest.
printf '%064d  backup.dump\n' 0 > "\${BACKUP}.sha256"
if bash "$ROOT/restore-db.sh" "$BACKUP" >"$TMP/mismatch.out" 2>&1; then
  echo "FAIL: production restore accepted a mismatched checksum" >&2
  exit 1
fi
grep -q 'Backup checksum verification failed' "$TMP/mismatch.out"
assert_not_restored
echo "PASS: production restore rejects a mismatched checksum"

# A valid digest remains valid when the sidecar names the original path rather
# than the current mounted/copied path.
DIGEST="$(sha256sum "$BACKUP" | awk '{ print $1 }')"
printf '%s  /original/backup.dump\n' "$DIGEST" > "\${BACKUP}.sha256"
bash "$ROOT/restore-db.sh" "$BACKUP" >"$TMP/valid.out" 2>&1
[ "$(wc -l < "$LOG" | tr -d ' ')" = "1" ]
echo "PASS: valid checksum works when backup path changes"

# Keep the non-production recovery behavior explicit: missing checksum warns,
# but does not block a manually requested non-production restore.
rm -f "\${BACKUP}.sha256" "$LOG"
export NODE_ENV=test
bash "$ROOT/restore-db.sh" "$BACKUP" >"$TMP/nonproduction.out" 2>&1
grep -q 'no checksum file found' "$TMP/nonproduction.out"
[ "$(wc -l < "$LOG" | tr -d ' ')" = "1" ]
echo "PASS: non-production restore warns when checksum is missing"
