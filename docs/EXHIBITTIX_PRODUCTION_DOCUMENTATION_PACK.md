# ExhibitTix Production Documentation Pack

Status: Working production baseline. This document consolidates the canonical documentation set and distinguishes implemented/verified behavior from requirements that still need evidence.

## 1. Product Requirements
ExhibitTix connects Super Admins, Organizers, Exhibitors and Visitors across the exhibition/event lifecycle:
Organizer creates event -> venue/hall/stalls -> exhibitor registration -> stall booking -> payment -> visitor registration -> ticket purchase -> payment -> QR ticket -> check-in -> lead capture -> analytics -> refunds/reconciliation.

Launch goals:
- Reduce manual exhibition operations.
- Prevent stall/ticket inventory conflicts.
- Provide auditable payment/refund workflows.
- Give exhibitors actionable lead data.
- Give organizers operational and financial visibility.
- Enforce tenant isolation and least privilege.

Advanced AI, recommendations, WhatsApp automation, SSO and multi-currency are separate future decisions unless explicitly enabled.

## 2. Business Rules & Workflows
### Stall booking
Available -> Reserved -> Payment Pending -> Confirmed.
Payment failure/expiry -> Available.
Cancellation/refund -> Available only when business rules permit.
Server/database state is authoritative. Concurrent booking attempts must not create duplicate active bookings.

### Ticketing
Ticket types have capacity, price, availability and purchase limits. Inventory must be protected against concurrent purchases. Cancelled/refunded tickets cannot be checked in.

### Payments
Order -> payment initiated -> pending -> server-verified success or failed. Never trust frontend success. Provider webhooks/signatures and reconciliation are authoritative.

### Check-in
Validate event, ticket, paid status, cancellation/refund state and prior check-in. Duplicate check-ins are rejected and logged.

### Leads
Visitor -> Event -> Exhibitor -> Stall/interaction -> Lead -> Follow-up -> Analytics. Duplicate handling must follow an explicit business key while preserving interaction history.

## 3. Roles, Permissions & Tenant Isolation
Roles: Super Admin, Organizer, Exhibitor, Visitor.
Principles:
- Least privilege.
- Server-side authorization on every protected read and mutation.
- Tenant scope comes from authenticated identity and authoritative database relationships, not untrusted client IDs.
- Prevent IDOR/BOLA and privilege escalation.
- UI visibility is not a security control.

Organizer: own events and delegated team scope.
Exhibitor: own company, participation, bookings, invoices/payments and permitted leads.
Visitor: own profile, registrations, orders and tickets.
Super Admin: platform scope with audit logging.

## 4. System Architecture
Logical flow:
Client -> API/application services -> authorization/business rules -> Prisma/database -> external services.

Domains:
Identity, tenancy, events, venues/floor plans, exhibitors, stalls/bookings, ticketing/orders, payments/refunds, check-in, leads, notifications, subscriptions, analytics and audit.

Universal Event is the generalized event foundation. Exhibition remains compatibility-linked through Exhibition.eventId. Progressive read cutover must be route-by-route and compatibility preserving.

Production dependencies include hosting, database, object storage, monitoring, notification providers and payment provider configuration.

## 5. Database & ERD
Core entities include:
User, Organizer, Exhibitor, Visitor, Event, EventCategory, EventModuleEnablement, Venue, Hall, Stall, StallBooking, TicketType, Order, Payment, Refund, Ticket, CheckIn, Lead, LeadInteraction, LeadFollowUp, Notification, Subscription, Invoice, AuditLog.

Important relationships:
Organizer 1:N Event.
Event 1:N halls/stalls/ticket types.
Exhibitor 1:N StallBooking.
Order 1:N Ticket and Payment.
Payment 1:N Refund where partial refunds are supported.
Ticket 1:0..1 CheckIn.
Event + Exhibitor + Visitor context -> Lead.
Exhibition 0..1:1 Event through nullable unique Exhibition.eventId.

Major entities require stable primary keys, foreign keys, status, timestamps, ownership, unique constraints and operational indexes. Financial/operational history should normally be archived rather than hard deleted.

## 6. API Specification
API principles:
- Consistent versioning/namespacing.
- Request validation.
- Server-side authorization.
- Stable error responses.
- Pagination/search/filter/sort for operational collections.
- Idempotency for retryable financial mutations.
- Transactions for inventory and financial invariants.

Core domains:
auth, organizers, events, event-categories, event-modules, venues, halls, stalls, stall-bookings, exhibitors, ticket-types, orders, payments, refunds, tickets, check-ins, leads, notifications, subscriptions, invoices, audit.

## 7. Authentication, RBAC & Tenant Isolation
Protect sessions/tokens. Use secure password/OTP handling where applicable. Apply expiry/revocation and avoid leaking authentication state.
Every protected resource must be authorized against the authenticated identity and authoritative ownership relationship.
Required regressions include cross-organizer access, cross-exhibitor access, unauthorized mutations, role escalation, direct API access to hidden resources and bulk-operation scope violations.

## 8. Security Threat Model
Primary threats:
IDOR/BOLA, privilege escalation, cross-tenant leakage, forged payment/webhooks, duplicate financial operations, SQL injection, XSS, malicious uploads, session compromise, rate-limit abuse, sensitive data leakage and booking/inventory race conditions.

Mitigations:
Centralized authorization, parameterized database access, strict validation, webhook signature verification, idempotency, transactional inventory controls, upload validation, security headers/CORS, rate limits, secret redaction and audit logs.

Any raw SQL in concurrency-sensitive paths requires parameterization, review and regression tests.

## 9. Payment Architecture
State model:
Order created -> payment initiated -> pending -> verified success/failed.
Refund:
Requested -> processing -> succeeded/failed.

Requirements:
- Never trust client redirects as proof.
- Verify provider responses server-side.
- Verify webhook signatures.
- Process webhooks idempotently.
- Persist provider references.
- Reconcile provider/application state.
- Prevent duplicate capture/refund processing.
- Preserve immutable financial history.

Reporting must separate gross revenue, discounts, taxes, payment fees, refunds, net revenue and platform earnings.

Live Razorpay verification requires an actual account and credentials. Until available, mock/provider-abstraction tests can validate application logic but cannot prove live integration.

## 10. Refund & Cancellation
Eligibility must be explicit per ticket/event/stall policy.
Refund states: Requested -> Approved/Processing -> Succeeded/Failed.
Support full/partial refunds where implemented. Never refund above captured amount. Prevent duplicate refunds. Reconcile provider results. Preserve audit history. Do not hard-delete financial records.

## 11. Audit Logging
Audit:
authentication/security events, permission changes, membership changes, event publishing, stall booking changes, payment/refund mutations, ticket/check-in actions, lead export/access, subscriptions/billing and administrative configuration.

Minimum fields:
actor, role, tenant context, action, entity type/id, timestamp, result, correlation/request ID and safe metadata.

Never log passwords, tokens, payment secrets or unnecessary sensitive data.

## 12. Privacy & Data Protection
Data categories include identity/contact data, registration, ticket/order data, payment references, check-ins, leads/interactions and operational audit data.

Principles:
data minimization, access restriction, encryption/protection in transit and at rest, controlled retention, secure backups, incident response and processor/vendor review.

For an India-first launch, applicable Indian privacy requirements and any other target-jurisdiction obligations must be reviewed. This document is not legal advice.

## 13. QA & Test Strategy
Test layers:
unit, API, integration, database, UI, E2E, permissions, security, concurrency, payment, regression and performance.

Critical tests:
event publishing, stall double-book prevention, reservation expiry, ticket capacity boundaries, concurrent purchase, payment verification/webhooks, duplicate webhook, refund boundaries, duplicate refund, QR validation, duplicate check-in, cross-tenant rejection, role escalation rejection, lead deduplication and analytics reconciliation.

Statuses:
PASS, PARTIAL PASS, FAIL, BLOCKED, NOT TESTED.
PASS requires actual evidence, not only a developer assertion.

## 14. Critical E2E
E2E-01: Organizer -> event -> venue/hall/stalls -> publish -> exhibitor -> stall booking -> payment.
E2E-02: Visitor -> registration -> ticket -> order -> payment -> verified ticket -> QR.
E2E-03: Scanner -> QR -> server validation -> check-in -> duplicate rejection.
E2E-04: Visitor interaction -> exhibitor lead -> follow-up -> analytics.
E2E-05: Eligible cancellation -> refund -> provider reconciliation -> inventory/state update.
E2E-06: Tenant A attempts tenant B resource -> rejected and safely audited.

## 15. Production Readiness
P1/P0 gates:
- Real staging environment.
- Production object storage.
- Monitoring/alerting.
- Payment provider verification.
- Backup/restore drill.
- Main branch protection.
- Production secrets management.
- Migration and rollback procedure.
- Error tracking.
- Security regression suite.
- Critical E2E suite.
- Accessibility/responsive verification.
- Privacy/retention review.
- Operational support process.

If Razorpay is unavailable, continue independent work and mark live payment verification BLOCKED. Do not mark it PASS.

Launch should not proceed with unresolved critical authorization, tenant-isolation, payment-integrity, data-integrity or backup/recovery issues.

## 16. Risk Register
P0: cross-tenant authorization regression; booking race; ticket inventory race; forged/weak payment webhook handling.
P1: unavailable live payment provider; missing production infrastructure; untested restore; incomplete observability; incomplete Universal Event read cutover; unreviewed legal policies.
P2/P3: advanced automation and enhancement features that do not block the core transaction lifecycle.

## 17. Privacy Policy Draft
DRAFT - legal review required.
ExhibitTix may process account, organizer, exhibitor, visitor, registration, ticketing, payment-reference, check-in, lead and operational data to provide the service, security, support, analytics and legally permitted communications.
Access is restricted by role and tenant. Payment credentials should be handled by the configured payment provider where possible.
Final retention, user rights, processors, cookies, marketing consent, jurisdiction and contact details must be completed before publication.

## 18. Terms of Service Draft
DRAFT - legal review required.
Terms should cover account responsibilities, acceptable use, organizer event responsibilities, exhibitor/visitor responsibilities, ticketing, fees/subscriptions, cancellations/refunds, IP, privacy, service availability, security/abuse, suspension/termination, liability and governing law.
Final commercial/legal wording requires review.

## 19. Refund & Cancellation Policy Draft
DRAFT - business/legal review required.
The final policy must define cancellation windows, eligible/non-eligible products, fees/taxes, full/partial refund rules, organizer cancellation, event postponement/cancellation, processing timelines, provider limitations, stall rules and dispute/chargeback handling.
The platform must enforce the published policy consistently and retain the decision audit trail.

## Documentation completion rule
A document describes requirements and current evidence; it does not convert an unverified feature into a production-ready feature. For every major workflow, implementation, API, database state, permission behavior, error state, security control and test evidence must be cross-checked before the status becomes VERIFIED.
