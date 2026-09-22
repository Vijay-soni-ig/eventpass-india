# QA & Test Strategy

Layers: unit, API, integration, database, UI, E2E, permissions, security, concurrency, payment, regression and performance.

Mandatory tests:
- Event creation/publishing.
- Stall double-book prevention.
- Reservation expiry.
- Ticket capacity boundary.
- Concurrent ticket purchase.
- Payment verification/webhook.
- Duplicate webhook.
- Refund boundary/duplicate refund.
- QR validation and duplicate check-in rejection.
- Cross-tenant access rejection.
- Role escalation rejection.
- Lead deduplication.
- Analytics reconciliation.

PASS requires executed evidence. Developer assertions alone are insufficient.

Statuses: PASS / PARTIAL PASS / FAIL / BLOCKED / NOT TESTED.