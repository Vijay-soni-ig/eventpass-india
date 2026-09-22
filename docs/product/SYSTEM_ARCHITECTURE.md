# System Architecture

Clients → API/application layer → authentication/authorization → domain services → Prisma/database → external providers.

Domains: identity, tenancy, events, venues/floor plans, exhibitors, stall bookings, ticketing/orders, payments/refunds, check-in, leads, notifications, subscriptions, analytics and audit.

Principles:
- Server-authoritative business rules.
- Database transactions for financial and inventory invariants.
- Idempotency for retryable operations.
- Auditability for sensitive mutations.
- Additive Universal Event migrations.
- Operational data separated from reporting projections.

Universal Event is the generalized event foundation. Exhibition remains compatibility-linked through nullable unique Exhibition.eventId. Progressive read cutover must be route-by-route verified.

External production dependencies include payment provider, object storage, notification services, hosting and monitoring.

APIs must return deterministic errors, preserve transaction integrity and avoid exposing secrets.