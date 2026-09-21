# ExhibitTix — Backup & Restore Readiness

## Objective

P1-5 defines a production backup and restore drill for the PostgreSQL database and critical object-storage data. A backup is not considered usable until a restore has been exercised and verified.

## Database backup contract

Production PostgreSQL must have:

- automated scheduled backups;
- point-in-time recovery where supported by the hosting provider;
- retention aligned with business/legal requirements;
- encryption at rest and in transit;
- restricted backup access;
- backup failure alerting;
- documented recovery ownership.

Application-level exports are not a substitute for infrastructure/database backups.

## Object storage

Critical uploaded assets must be covered by the storage provider's backup/versioning or replication strategy. At minimum document:

- bucket name and environment;
- versioning status;
- retention/deletion protection where appropriate;
- encryption;
- recovery procedure;
- access ownership.

Do not copy production customer files into development or test environments.

## Restore drill

Perform the drill against an isolated recovery environment, never the live production database.

1. Select a known backup or recovery point.
2. Restore PostgreSQL into an isolated database.
3. Apply required schema migrations only if the recovery procedure requires them.
4. Verify connectivity and application startup against the restored database.
5. Run integrity checks for users, organizers, events, exhibitors, bookings, payments, refunds, tickets, check-ins, leads, subscriptions, invoices, and audit logs.
6. Verify foreign-key relationships and important unique constraints.
7. Verify financial totals and payment/refund records are internally consistent.
8. Verify object-storage references resolve for representative public and private assets.
9. Run smoke tests and relevant E2E tests against the recovery environment.
10. Record recovery duration and data-loss window.
11. Destroy or securely retain the isolated recovery environment according to policy.

## Recovery targets

Define explicit targets before launch:

- **RPO (Recovery Point Objective):** maximum acceptable data loss measured in time.
- **RTO (Recovery Time Objective):** maximum acceptable time to restore service.

The values must be chosen from the business's actual tolerance, not assumed by the application.

## Evidence

Record:

- backup provider/job;
- backup timestamp;
- restore point;
- restore start/end time;
- RTO achieved;
- estimated RPO;
- integrity-check results;
- application smoke/E2E results;
- object-storage recovery result;
- incidents/failures;
- corrective actions;
- operator and date.

Never put database passwords, access keys, or backup secrets in this document or Git.

## Definition of done

Repository readiness is complete when this runbook and its validation checklist are merged.

Operational P1-5 is complete only after an actual isolated restore drill succeeds and the evidence is retained outside Git.

Until then, backup readiness must be treated as **not verified**, even if the hosting provider advertises automated backups.
