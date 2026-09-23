# A2 Tenant Isolation Audit Baseline

## Purpose

Establish an evidence-backed baseline for the organizer/tenant isolation deep audit required by PR-01. This document records only repository evidence that was directly inspected. It does not claim that A2 is complete.

## Audit standard

For every organizer-scoped resource, a request must be authorized against the caller's permitted organizer/event scope before the target resource is read or mutated. Child-resource identifiers must not be treated as proof of ownership. Cross-tenant access attempts must return a non-success response and must not mutate the target tenant's data.

## Verified evidence on `main` at `c0b94e92e96be3eb722ae9af95921c5fe7437729`

### Event participants

`server/src/routes/eventParticipants.ts` applies `requireAuth` and `requireOrganizerAccess` at router scope. The helper `loadEvent()` resolves permitted organizer IDs for the requested permission and then loads the event with `organizerId: { in: organizerIds }`. Participant reads and mutations first resolve that event, and child participant mutations additionally require `eventId` to match the requested participant's owning event.

Status: **VERIFIED FOR THIS ROUTER**. Targeted cross-event regression coverage should still be added/confirmed before A2 completion.

### Ticket booking

`server/src/routes/bookings.ts` applies `requireAuth`. Ticket booking resolves the ticket type using both `id` and `exhibitionId`, and the exhibition must be live/public. Optional registration validation binds a registration to the requested exhibition and rejects a registration owned by another authenticated account; anonymous registration continuation requires an exact email match. Idempotency lookup is scoped to `(buyerUserId, idempotencyKey)`.

Status: **VERIFIED FOR INSPECTED BOOKING PATHS**. Full A2 coverage still requires review of every booking read/cancel/refund/admin path and adjacent payment paths.

## Newly verified evidence

### Universal Event Leads

`server/src/routes/eventLeads.ts` computes the caller's permitted organizer IDs and exhibitor business IDs before resolving EventLead records. Organizer access remains scoped to owned events; exhibitor access is additionally constrained to the caller's permitted exhibitor business IDs for list, detail, update, archive, interaction, and follow-up operations.

PR #160 added and merged a targeted cross-tenant regression covering shared-event exhibitors. The test verifies that an exhibitor cannot list, read, update, archive, or add interactions to another exhibitor's lead, and that the protected lead remains unchanged.

Status: **VERIFIED FOR UNIVERSAL EVENT LEADS**.

### Legacy Lead API

`server/src/routes/leads.ts` scopes reads, exports, detail access, mutations, and lead analytics through permitted exhibitor business IDs. PR #161 added and merged cross-tenant regression coverage for list, detail, export, update, and capture attempts.

Status: **VERIFIED FOR LEGACY EXHIBITOR LEADS**.

### Lead capture contexts

`server/src/routes/eventLeadCaptureContexts.ts` requires exhibitor business access and derives participation contexts only from confirmed participations belonging to permitted exhibitor businesses. PR #162 added and merged a shared-exhibition regression test proving another exhibitor's participation is not returned.

Status: **VERIFIED FOR LEAD CAPTURE CONTEXTS**.

### Organizer registrations

`server/src/routes/organizerRegistrations.ts` resolves every target Event through `organizerIdsWithPermission` before settings, analytics, list, or status mutation operations. PR #163 added and merged cross-organizer regression coverage for settings, analytics, list, settings mutation, and registration status mutation.

Status: **VERIFIED FOR ORGANIZER REGISTRATION OPERATIONS**.

### Organizer analytics

`server/src/routes/organizerAnalytics.ts` scopes dashboard and exhibition analytics to permitted organizer IDs. `server/src/routes/organizerEventAnalytics.ts` resolves the target Event against permitted organizer IDs before aggregating registrations, tickets, check-ins, orders, and ticket types. PR #164 added and merged cross-organizer regression coverage for dashboard filtering, exhibition detail analytics, and Event analytics.

Status: **VERIFIED FOR INSPECTED ORGANIZER ANALYTICS SURFACES**.

### Documents

PR #159 added and merged cross-tenant document list/download/delete regression coverage. The document router scopes every business operation through permitted exhibitor business IDs and uses server-side private storage access.

Status: **VERIFIED FOR DOCUMENT OPERATIONS**.

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
