# Risk Register

| Risk | Priority | Mitigation |
|---|---|---|
| Live payment provider unavailable | P1 | Configure provider; retain mock coverage |
| Production infrastructure incomplete | P1 | Establish staging/prod |
| Cross-tenant authorization regression | P0 | Automated authorization tests |
| Booking race condition | P0 | Transactional concurrency control |
| Ticket inventory race | P0 | Atomic reservation logic |
| Weak webhook verification | P0 | Signature + idempotency + reconciliation |
| Backup not restore-tested | P1 | Restore drill |
| Incomplete observability | P1 | Logs, metrics, alerts |
| Legal/policy drafts unreviewed | P1 | Business/legal review |
| Progressive Event read cutover incomplete | P1 | Route-by-route verification and rollback plan |