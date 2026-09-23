# A2 Tenant Isolation Audit Baseline

## Purpose

Establish an evidence-backed baseline for the organizer/tenant isolation deep audit required by PR-01. This document records only repository evidence that was directly inspected. It records the evidence used to close the repository-verifiable A2 audit scope.

## Audit standard

For every organizer-scoped resource, a request must be authorized against the caller's permitted organizer/event scope before the target resource is read or mutated. Child-resource identifiers must not be treated as proof of ownership. Cross-tenant access attempts must return a non-success response and must not mutate the target tenant's data.

## Verified evidence on `main` at `67df9cdae7de71484145004da35d9cb5ca94ffca`

### Event participants

`server/src/routes/eventParticipants.ts` applies `requireAuth` and `requireOrganizerAccess` at router scope. The helper `loadEvent()` resolves permitted organizer IDs for the requested permission and then loads the event with `organizerId: { in: organizerIds }`. Participant reads and mutations first resolve that event, and child participant mutations additionally require `eventId` to match the requested participant's owning event.

Status: **VERIFIED**. Existing cross-organizer participant regression coverage confirms the tenant boundary.

### Ticket booking

`server/src/routes/bookings.ts` applies `requireAuth`. Ticket booking resolves the ticket type using both `id` and `exhibitionId`, and the exhibition must be live/public. Optional registration validation binds a registration to the requested exhibition and rejects a registration owned by another authenticated account; anonymous registration continuation requires an exact email match. Idempotency lookup is scoped to `(buyerUserId, idempotencyKey)`.

Status: **VERIFIED**. Booking ownership and organizer-scoped booking/check-in paths have targeted regression coverage.

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

## A2 closure assessment

The repository-verifiable A2 tenant-isolation scope is now **COMPLETE** on this main state. The closure is based on direct route inspection plus targeted regression evidence across the resource families below. This does not replace deployment-level penetration testing or production environment verification.

### Closure matrix

| Resource family | Evidence | Status |
|---|---|---|
| Organizer | Organizer-scoped APIs resolve caller membership/permissions; cross-organizer Event, Exhibition, Registration, Analytics, Payment/Refund tests exercise the tenant root boundary. | VERIFIED |
| ExhibitorBusiness | Business/profile and exhibitor membership routes derive business scope from the authenticated user; cross-business team/stall/payment/document/lead tests cover business isolation. | VERIFIED |
| Event | Event API uses permitted organizer IDs; cross-organizer read/update/delete/publish regression coverage exists. | VERIFIED |
| Exhibition | Exhibition CRUD and content routes resolve the parent exhibition against permitted organizer IDs; PR #166 adds core cross-organizer Exhibition regression coverage. | VERIFIED |
| Stall | Exhibitor stall reads and mutations are scoped to the caller's participation/business; PR #166 plus phase 21C stall isolation coverage verify cross-tenant behavior. | VERIFIED |
| Booking / TicketBooking | Visitor bookings are buyer-scoped; organizer booking/check-in reads resolve exhibitions through permitted organizer IDs; ticket order ownership tests are merged. | VERIFIED |
| Ticket / TicketType | TicketType mutations are parent-Exhibition scoped; Event ticket order/check-in ownership tests and PR #166 cover tenant boundaries. | VERIFIED |
| Lead / EventLead | Legacy and universal lead list/detail/export/mutation/capture surfaces are tenant-scoped; PRs #160-#162 provide targeted regressions. | VERIFIED |
| Payment / Refund | Payment ownership and cross-tenant refund rejection are covered by merged payment/refund security tests. | VERIFIED |
| Document | Document list/download/delete operations are business-scoped; PR #159 verifies cross-tenant rejection and no mutation. | VERIFIED |
| Analytics | Organizer dashboard, Exhibition analytics, and Event analytics are scoped to permitted organizers; PR #164 verifies cross-tenant behavior. | VERIFIED |
| Event registrations / participation | Organizer registration APIs resolve the Event through permitted organizer IDs; PR #163 verifies cross-organizer read/mutation isolation. Event participant tests also verify organizer scoping. | VERIFIED |

### A2 acceptance result

All repository-verifiable A2 resource families have direct authorization evidence and targeted regression coverage. Cross-tenant requests are rejected without mutating the protected tenant's records in the tested mutation paths.

**A2 status: COMPLETE (repository-verifiable scope).**

### Historical audit scope

The matrix above is retained as the original audit checklist. Its repository-verifiable items are now closed; deployment-level penetration testing remains outside this repository audit.

## Acceptance rule

A2 is not complete until each in-scope family has either:

- direct code evidence plus targeted regression coverage proving tenant isolation, or
- an explicitly documented external/deployment dependency that prevents verification.

No production-readiness claim should be based on this baseline alone.
