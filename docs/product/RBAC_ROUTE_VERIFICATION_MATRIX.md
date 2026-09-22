# ExhibitTix RBAC Route Verification Matrix

Version: 1.0
Status: Route-level hardening baseline
Reviewed: 2026-09-22

## Purpose

This document records route-level authorization evidence for the highest-risk ExhibitTix APIs. A centralized permission definition is not treated as proof that a route enforces it.

Status values:
- VERIFIED — implementation and an automated test directly demonstrate the boundary.
- IMPLEMENTED / NOT VERIFIED — source inspection shows the intended boundary, but a dedicated automated test is not yet identified.
- PARTIAL — a boundary exists, but an important authorization or audit invariant remains unverified.
- NOT TESTED — no reliable current evidence.

## High-risk route matrix

| Area | Route(s) | Authorization boundary | Current evidence | Status |
|---|---|---|---|---|
| Visitor ticket ownership | GET /api/bookings/tickets/:id, /mine, /:id/qr | buyerUserId must equal authenticated user | ui04TicketOwnership.test.ts positive, cross-user, unauthenticated, malformed-ID cases | VERIFIED |
| Visitor ticket creation | POST /api/bookings/tickets | authenticated visitor + public/live exhibition + visible ticket type + server-side stock/entitlement checks | bookings.ts source; booking/entitlement tests exist | IMPLEMENTED / NOT VERIFIED |
| Universal ticket order | POST /api/event-ticket-orders | reservation must belong to authenticated user; reservation locked before order creation | eventTicketOrders.ts source | IMPLEMENTED / NOT VERIFIED |
| Universal ticket order history | GET /api/event-ticket-orders/mine | userId must equal authenticated user | eventTicketOrders.ts source | IMPLEMENTED / NOT VERIFIED |
| Payment read/verify | GET /api/payments/:id, POST /api/payments/:id/verify | payment must resolve to authenticated owner through ticket/stall/event order ownership | payments.ts source | IMPLEMENTED / NOT VERIFIED |
| Mock payment completion | POST /api/payments/:id/mock-complete | same payment ownership boundary; mock provider only | payments.ts source | IMPLEMENTED / NOT VERIFIED |
| Organizer payment list | GET /api/organizer/payments | payment records filtered through authorized organizer IDs | organizerPayments.ts source | IMPLEMENTED / NOT VERIFIED |
| Organizer payment detail | GET /api/organizer/payments/:paymentId | payment resource must map to an authorized organizer | organizerPayments.ts source | IMPLEMENTED / NOT VERIFIED |
| Organizer payment mutation | PATCH /api/organizer/payments/:paymentId | payment:manage + organizer-scoped stall payment lookup | organizerPayments.ts source | PARTIAL |
| Organizer refund | POST /api/organizer/payments/:paymentId/refund | payment:manage + authorized organizer ownership + refund service/idempotency | refundSecurity.test.ts cross-tenant and unauthorized-role coverage | VERIFIED |
| Organizer refund completion | POST /api/organizer/payments/:paymentId/refunds/:refundId/mock-complete | payment scope checked before refund lookup/finalization | organizerPayments.ts source + refund security coverage | IMPLEMENTED / NOT VERIFIED |
| Organizer QR scanner | GET/PATCH /api/bookings/tickets/lookup, check-in | scanner:use + organizer tenant scope; override separately requires checkin:override | bookings.ts source | IMPLEMENTED / NOT VERIFIED |
| Universal QR scanner | GET /api/event-ticket-check-in/summary, POST /api/event-ticket-check-in | scanner:use + organizer tenant scope; ticket/event/payment/status checks | eventTicketCheckIn.ts source | IMPLEMENTED / NOT VERIFIED |
| Exhibitor scanner | GET/PATCH /api/exhibitor-scanner/* | scanner:use + confirmed participation + non-suspended exhibitor business; override separately gated | exhibitorScanner.ts source | IMPLEMENTED / NOT VERIFIED |
| Organizer member roster | GET /api/organizer-members/:organizerId | active membership in target organizer; suspended organizers excluded | PR #144 regression tests | VERIFIED |
| Exhibitor member roster | GET /api/exhibitor-members/:exhibitorBusinessId | active membership in target business; suspended businesses excluded | PR #144 regression tests | VERIFIED |
| Organizer member mutation | POST/PATCH/DELETE /api/organizer-members/* | target membership's organizer resolves caller role; only owner/admin may mutate | organizerMembers.ts source | IMPLEMENTED / NOT VERIFIED |
| Exhibitor member mutation | POST/PATCH/DELETE /api/exhibitor-members/* | target membership's business resolves caller role; only owner/admin may mutate | exhibitorMembers.ts source | IMPLEMENTED / NOT VERIFIED |

## Findings

### F-001 — Dedicated payment ownership test coverage should be expanded
The implementation uses a shared loadOwnedPayment helper that resolves ownership through the ticket booking buyer, universal ticket order user, or stall booking buyer. Source inspection supports the intended boundary, but dedicated automated tests should cover GET, signature verification, and mock completion for cross-user access.

Priority: P1.

### F-002 — Universal ticket-order ownership needs explicit regression tests
The route re-reads and locks the reservation and checks that the current reservation user matches the authenticated user. This is the correct server-side boundary, but the repository needs explicit positive/negative tests proving visitor A cannot create an order from visitor B's reservation.

Priority: P1.

### F-003 — Scanner route coverage needs explicit cross-tenant tests
The organizer and universal scanner routes resolve organizer scope through scanner:use; the exhibitor scanner additionally requires confirmed participation. These are high-risk operational endpoints and should have automated cross-organizer, cross-exhibition, role, suspended-tenant, unpaid-ticket, and duplicate-scan cases.

Priority: P1.

### F-004 — Organizer payment PATCH is narrower than the generic payment model
PATCH /api/organizer/payments/:paymentId currently resolves a stallBooking only. That is safe from a cross-tenant perspective, but it means the route is not a generic organizer payment mutation endpoint for event-ticket payments. This should remain explicit rather than being mistaken for universal payment management.

Priority: P1 product/API consistency review.

### F-005 — Member role lifecycle invariants require explicit tests
Member mutations are tenant-scoped, but the current routes allow owner/admin actors to change membership roles/status without a dedicated invariant test for last-owner protection, self-removal, or owner/admin role assignment. These behaviors depend partly on unresolved business decisions and should not be silently changed.

Priority: P1 decision + tests.

## Next verification sequence

1. Add explicit universal ticket-order ownership tests.
2. Add payment ownership tests for GET/verify/mock-complete.
3. Add organizer/universal/exhibitor scanner negative-path tests.
4. Audit member role lifecycle invariants.
5. Update the canonical RBAC matrix with the resulting evidence.
6. Re-run CI, Browser E2E, and Dependency Audit before merge.

## Evidence rule

A route is not marked VERIFIED merely because:
- it imports requireAuth;
- it calls a centralized access helper;
- a permission exists in permissions.ts; or
- the UI hides a control.

Verification requires executable positive/negative evidence against the actual endpoint and resource boundary.
