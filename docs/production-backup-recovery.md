# ExhibitTix Production Backup & Recovery Runbook

## Scope

This runbook covers PostgreSQL backup/restore for the ExhibitTix production application. It is a recovery control, not a substitute for managed-database backups or tested disaster recovery.

## Recovery objectives

Until production infrastructure is provisioned and measured, use these as **targets**, not verified guarantees:

- **RPO target:** 24 hours or better, depending on the final backup schedule.
- **RTO target:** 4 hours or better for database recovery.
- Actual RPO/RTO must be measured during an isolated restore drill before launch.

## Backup policy

1. Use a managed PostgreSQL service with automated point-in-time recovery where available.
2. Run `bash scripts/backup-db.sh` at least daily when application-managed logical backups are required.
3. Keep at least 14 days of logical backups; increase retention for business/legal requirements.
4. Store backups outside the application host. A local disk or Docker volume is **not** a disaster-recovery backup.
5. Encrypt backups at rest and in transit. Restrict access to the production operations team.
6. Keep the checksum file beside each backup and verify it before restore.
7. Never commit database dumps, credentials, or backup archives to Git.

## Create a backup

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_DIR='/secure/backups/eventpass/postgres'
export BACKUP_RETENTION_DAYS=14
bash scripts/backup-db.sh
```

The script creates a PostgreSQL custom-format `.dump` plus a SHA-256 checksum. File permissions are restricted through `umask 077`.

## Restore drill — required before launch

Always restore into an **isolated recovery database** first.

```bash
export DATABASE_URL='postgresql://.../eventpass_recovery'
bash scripts/restore-db.sh /secure/backups/eventpass/postgres/<backup>.dump
```

Then run migrations/status checks appropriate to the deployed application and execute the critical verification checklist below.

### Database integrity checklist

Verify counts and relationships for at least:

- users and role/membership records
- organizers and organizer memberships
- exhibitions/events, venues/halls/stalls
- exhibitor businesses and participations
- stall bookings and ticket bookings
- orders/payments/refunds/payment events
- ticket types and issued tickets
- check-ins
- leads and follow-up records
- subscriptions/invoices where present
- audit logs
- `auth_sessions`

For financial records, compare aggregate totals (gross payments, refunds, refunded amounts, fees/taxes where applicable) against the source environment or an independently retained reconciliation export.

## Production restore

A production restore is destructive and must follow incident/change-control approval.

```bash
export NODE_ENV=production
export CONFIRM_PRODUCTION_RESTORE=YES
export DATABASE_URL='postgresql://...'
bash scripts/restore-db.sh /secure/backups/eventpass/postgres/<backup>.dump
```

Before proceeding:

1. Stop or isolate application writes.
2. Identify the incident and target recovery point.
3. Preserve the current database state if forensic/reconciliation work is required.
4. Confirm the backup checksum and timestamp.
5. Prefer managed point-in-time recovery when available.
6. Restore and run migrations/health checks.
7. Run critical business-flow verification.
8. Reconcile payments/refunds before reopening financial operations.
9. Re-enable traffic only after application and data checks pass.

## Application recovery ordering

1. Provision/verify database.
2. Restore database or select the correct point-in-time recovery target.
3. Verify migrations/schema.
4. Restore durable object/file storage if required.
5. Provision secrets/configuration from the approved secret manager.
6. Start API and verify `/api/health/ready`.
7. Start frontend/reverse proxy.
8. Verify authentication, event discovery, booking, payment state, QR check-in, leads, and analytics.
9. Reconcile payment provider events before declaring recovery complete.

## File uploads

The current single-host Docker deployment uses a persistent `exhibittix_uploads` volume. That protects against a container restart but is **not sufficient for host loss**. Production should use durable object storage with versioning/backups before horizontal scaling or disaster-recovery sign-off.

## Backup drill evidence

Record each drill:

- backup timestamp and source environment
- backup artifact/checksum
- restore target
- restore start/end time
- measured RTO
- estimated RPO
- verification results
- discrepancies and remediation
- operator and approval reference

**Status:** controls and runbook implemented; real production backup/restore drill remains **NOT VERIFIED** until executed against the deployed production infrastructure or an equivalent isolated production-like environment.
