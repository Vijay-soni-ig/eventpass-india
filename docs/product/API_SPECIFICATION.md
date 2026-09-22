# API Specification

Principles:
- Consistent API namespace/versioning.
- Validate body, params and query filters.
- Authorize every protected route.
- Stable error shape.
- Pagination for collections.
- Search/filter/sort where operationally required.
- Idempotency for retryable financial mutations.

Core domains: /auth, /organizers, /events, /event-categories, /event-modules, /venues, /halls, /stalls, /stall-bookings, /exhibitors, /ticket-types, /orders, /payments, /refunds, /tickets, /check-ins, /leads, /notifications, /subscriptions, /invoices, /audit.

Every mutation must enforce authorization, validation, business rules, transaction boundaries and audit logging where appropriate.

Payment APIs must never treat a client redirect as proof of payment. Verify provider responses/webhooks server-side.

Booking/ticket inventory mutations require transactional concurrency protection.