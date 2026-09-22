# A2 Tenant Isolation Audit Baseline

## Purpose

Establish an evidence-backed baseline for the organizer/tenant isolation deep audit required by PR-01. This document records only repository evidence that was directly inspected. It does not claim that A2 is complete.

## Audit standard

For every organizer-scoped resource, a request must be authorized against the caller's permitted organizer/event scope before the target resource is read or mutated. Child-resource identifiers must not be treated as proof of ownership. Cross-tenant access attempts must return a non-success response and must not mutate the target tenant's data.

## Verified evidence on `main` at `fc79ade40afc97131e9362222ebcc721b95ad043`

### Event participants

`server/src/routes/eventParticipants.ts` applies `requireAuth` and `requireOrganizerAccess` at router scope. The helper `loadEvent()` resolves permitted organizer IDs for the requested permission and then loads the event with `organizerId: { in: organizerIds }`. Participant reads and mutations first resolve that event, and child participant mutations additionally require `eventId` to match the requested participant's owning event.

Status: **VERIFIED FOR THIS ROUTER**. Targeted cross-event regression coverage should still be added/confirmed before A2 completion.

### Ticket booking

`server/src/routes/bookings.ts` applies `requireAuth`. Ticket booking resolves the ticket type using both `id` and `exhibitionId`, and the exhibition must be live/public. Optional registration validation binds a registration to the requested exhibition and rejects a registration owned by another authenticated account; anonymous registration continuation requires an exact email match. Idempotency lookup is scoped to `(buyerUserId, idempotencyKey)`.

Status: **VERIFIED FOR INSPECTED BOOKING PATHS**. Full A2 coverage still requires review of every booking read/cancel/refund/admin path and adjacent payment paths.

## Remaining A2 review matrix

The following resource families remain explicitly in scope and are not marked complete by this baseline:

- Organizer
- ExhibitorBusiness
- Event
- Exhibition
- Stall
- Booking / TicketBooking
- Ticket / TicketType
- Lead / EventLead
- Payment / Refund
- Document
- Analytics
- Event registrations and participation records

For each family, inspect:

1. list/read authorization
2. detail-by-ID authorization
3. create authorization and organizer assignment
4. update authorization
5. delete/archive authorization
6. nested child-resource ownership
7. export/download authorization
8. analytics aggregation scope
9. payment/refund ownership
10. regression coverage for a second organizer/tenant

## Acceptance rule

A2 is not complete until each in-scope family has either:

- direct code evidence plus targeted regression coverage proving tenant isolation, or
- an explicitly documented external/deployment dependency that prevents verification.

No production-readiness claim should be based on this baseline alone.
