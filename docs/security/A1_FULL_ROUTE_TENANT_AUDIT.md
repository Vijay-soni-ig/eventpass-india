# A1 — Full Route-Level Tenant Isolation Audit

**Scope:** Express API route surface, authentication/RBAC, tenant ownership, mutation hardening, sensitive data exposure, financial/inventory concurrency, audit logging, negative-path regression coverage, public endpoint policy, and deployment-level security gates.

## Objective

Close the repository-verifiable portion of the A1 security gate in one focused cycle. Status labels are evidence-based: VERIFIED, PARTIAL, EXTERNAL, NOT VERIFIED.

A1 is not declared production-security-complete solely from this document.

## 11-point closure checklist

| # | Control | Result | Evidence |
|---|---|---|---|
| 1 | Enumerate every mounted route | VERIFIED | server/src/app.ts is reconciled against docs/security/A1_ENDPOINT_INVENTORY.md; a regression test prevents inventory drift. |
| 2 | Authentication boundary | VERIFIED (repository) | Protected routers use requireAuth; platform routes use super-admin authorization; public/webhook routes intentionally use separate trust controls. |
| 3 | RBAC / permission boundary | VERIFIED for reviewed protected families | Organizer/exhibitor permissions derive from active membership; owner invariants were hardened in PR #272. |
| 4 | Tenant/owner scoping | VERIFIED for high-risk families; regression-covered | Evidence covers exhibitions/floor plans/bookings, organizer payments, ticket inventory, event leads, capture contexts, registrations, analytics, documents, memberships and event participants. |
| 5 | Mutation rate limiting | VERIFIED (repository) | Existing evidence covers auth, exhibitions, business, floor plans, ticketing, platform admin, payments, check-in, leads/documents and exhibitor mutations; public operations use read/search classes. |
| 6 | Input validation | VERIFIED for reviewed mutation surfaces | Zod validation covers major financial, event, exhibition, ticket, lead and participant mutations; uploads enforce type/size/magic-byte constraints. |
| 7 | Sensitive data exposure | VERIFIED for reviewed surfaces | Private documents are authenticated and tenant-scoped; public APIs use explicit safe projections and lifecycle/visibility gates; payment reads are ownership-scoped. |
| 8 | Idempotency / concurrency | VERIFIED for high-risk flows | Reservation/order locking, payment/refund state transitions and idempotency, and transactional duplicate check-in protection are implemented. |
| 9 | Audit logging | VERIFIED for reviewed security-sensitive flows | Owner changes, payments, check-ins and other high-risk state changes have audit evidence. |
| 10 | Unauthorized/cross-tenant 4xx behavior | VERIFIED for regression-covered high-risk families | Cross-tenant access uses non-enumerating 404s in covered tests; PR #274 covers event participant families. |
| 11 | Regression + production verification gates | PARTIAL | Repository CI/E2E/dependency gates can verify code. Production storage, rate-limit distribution, CORS/TLS, monitoring, Razorpay, backup/restore drill and branch protection remain external launch gates. |

## Route-family classification

| Prefix | Trust / tenant boundary | Status |
|---|---|---|
| /api/storage | Public/private object policy; private objects require authenticated tenant access | VERIFIED repository / EXTERNAL production storage |
| /api/auth | Account identity | VERIFIED |
| /api/onboarding | Authenticated onboarding ownership | VERIFIED repository |
| /api/registrations | Visitor-owned registration/order data | VERIFIED repository |
| /api/organizer/registrations | Organizer membership | VERIFIED + cross-organizer regression |
| /api/organizer/event-tickets | Organizer event/ticket ownership | VERIFIED |
| /api/event-ticket-reservations | Visitor/order ownership + ticket availability | VERIFIED |
| /api/event-ticket-orders | Visitor/order ownership | VERIFIED |
| /api/event-tickets | Organizer inventory / issued-ticket ownership | VERIFIED + cross-organizer regression |
| /api/event-ticket-check-ins | Scanner permission + organizer event ownership | VERIFIED |
| /api/organizer/event-analytics | Organizer event ownership | VERIFIED + cross-organizer regression |
| /api/business | Exhibitor-business membership | VERIFIED |
| /api/organizer-members | Organizer tenant membership | VERIFIED + cross-tenant regression |
| /api/exhibitor-members | Exhibitor-business membership | VERIFIED + cross-tenant regression |
| /api/exhibitions | Organizer ownership; Exhibition compatibility module | VERIFIED + cross-organizer regression |
| /api/events | Organizer-owned canonical Event + event modules | VERIFIED; participant regression added |
| /api/event-categories | Canonical category read policy | VERIFIED |
| /api/platform/event-categories | Super-admin platform boundary | VERIFIED |
| /api/bookings | Organizer booking ownership + buyer ownership | VERIFIED + cross-organizer regression |
| /api/exhibitor/participations | Exhibitor-business participation | VERIFIED |
| /api/exhibitor/scanner | Exhibitor scanner permission + event boundary | VERIFIED repository |
| /api/organizer/payments | Organizer ownership derived from related booking/order | VERIFIED + cross-organizer regression |
| /api/payments | Buyer ownership derived from booking/order | VERIFIED |
| /api/documents | Exhibitor-business tenant ownership | VERIFIED + cross-exhibitor regression |
| /api/leads | Exhibitor-business ownership | VERIFIED |
| /api/organizer/leads | Organizer event ownership | VERIFIED |
| /api/event-leads/capture-contexts | Event/exhibitor participation ownership | VERIFIED + regression |
| /api/event-leads | Exhibitor lead ownership | VERIFIED + regression |
| /api/organizer/analytics | Organizer ownership | VERIFIED + cross-organizer regression |
| /api/organizer/subscription | Organizer subscription ownership | VERIFIED repository |
| /api/organizer/profile | Organizer membership ownership | VERIFIED repository |
| /api/organizer/gallery | Organizer media ownership | VERIFIED repository |
| /api/organizers | Public organizer/follow state | VERIFIED repository |
| /api/saved-exhibitions | Visitor-owned saved state | VERIFIED repository |
| /api/notifications | User-owned notification state | VERIFIED repository |
| /api/platform | Super-admin platform boundary | VERIFIED repository |
| /api/public | Deliberately public; visibility/module policy + bounded queries + rate limits | VERIFIED repository / EXTERNAL abuse infrastructure |
| /api/pricing | Public/platform pricing read policy | VERIFIED repository |

## Direct endpoints

- GET /api/health — intentionally public liveness.
- GET /api/health/ready — intentionally public readiness; exposes only readiness state.
- POST /api/webhooks/payments/* — provider signature/idempotency trust boundary; JWT is intentionally not required.

## High-risk negative-path evidence

Current mainline has targeted regression coverage for:

- organizer A → organizer B exhibitions, floor plans and bookings;
- organizer A → organizer B payments/refunds;
- organizer A → organizer B event-ticket inventory;
- exhibitor A → exhibitor B documents;
- organizer A → organizer B registrations and analytics;
- exhibitor A → another tenant's event leads/capture context;
- organizer A → organizer B membership records;
- organizer A → organizer B event participants across partner, speaker, sponsor, vendor and staff modules.

The participant regression is not treated as proof for unrelated route families.

## Findings

### F1 — Route inventory drift

The prior A1 inventory had become stale as new participant/media/contact/activity/session/sponsor/vendor/partner/staff/public/webhook routes were added.

Resolved in this cycle: inventory is reconciled and a1RouteInventory.test.ts prevents future mounted-prefix drift.

### F2 — Repository evidence vs production evidence

These remain deployment-level launch gates and are not marked PASS here:

- real S3-compatible bucket, encryption/versioning/lifecycle and private/public policy;
- production CORS origins and TLS/domain configuration;
- distributed rate-limit behavior behind production topology;
- runtime monitoring/alert delivery;
- credentialed Razorpay verification;
- actual backup/restore drill;
- GitHub main branch protection / required checks.

## Security acceptance criteria

A1 repository closure requires:

1. every mounted API prefix documented;
2. every protected route family assigned an explicit trust/tenant boundary;
3. no route relying solely on client-supplied tenant identifiers;
4. high-risk cross-tenant operations covered by negative-path regression tests;
5. public routes using intentional visibility, field-selection, pagination and rate limits;
6. financial/inventory mutations protected server-side for state/concurrency;
7. private file routes authenticated and tenant-scoped;
8. platform routes protected by platform-admin authorization;
9. CI, Browser E2E and Dependency Audit green on the exact PR head;
10. deployment-only controls explicitly separated from repository PASS;
11. main re-inspected after merge before A2.

## Next task after A1

Proceed to A2 — organizer/tenant isolation deep audit, focusing on resource lookup/mutation boundaries across Organizer, ExhibitorBusiness, Event, Exhibition, Stall, Booking, Ticket, Lead, Payment, Document and Analytics ownership.
