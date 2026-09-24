# A1 Security Endpoint Inventory

**Audit date:** 2026-09-24  
**Main baseline:** `57f30ff032905e608df41ede0cda90fb88cab9e8`

This inventory is derived from `server/src/app.ts` and identifies every mounted router prefix plus direct health endpoints. It is the first pass of the endpoint-by-endpoint security audit.

## Direct application endpoints

- GET /api/health
- GET /api/health/ready

## Mounted API routers

| Prefix | Router | Security classification |
|---|---|---|
| `/api/storage` | `storage` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/auth` | `auth` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/onboarding` | `onboarding` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/registrations` | `registrations` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/registrations` | `organizerRegistrations` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/event-tickets` | `eventTickets` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/event-ticket-reservations` | `eventTicketReservations` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/event-ticket-orders` | `eventTicketOrders` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/event-tickets` | `eventTicketsIssued` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/event-ticket-check-ins` | `eventTicketCheckIn` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/event-analytics` | `organizerEventAnalytics` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/business` | `business` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer-members` | `organizerMembers` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/exhibitor-members` | `exhibitorMembers` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/exhibitions` | `exhibitionContent` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/exhibitions` | `floorPlanLayout` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/exhibitions` | `exhibitions` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/events` | `events` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/events` | `eventParticipants` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/events` | `eventSpeakers` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/events` | `eventSponsors` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/events` | `eventVendors` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/events` | `eventPartners` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/events` | `eventStaff` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/event-categories` | `eventCategoryRead` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/platform/event-categories` | `eventCategories` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/bookings` | `bookings` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/exhibitor/participations` | `exhibitorParticipations` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/exhibitor/scanner` | `exhibitorScanner` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/payments` | `organizerPayments` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/payments` | `payments` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/documents` | `documents` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/leads` | `leads` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/leads` | `organizerLeads` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/event-leads/capture-contexts` | `eventLeadCaptureContexts` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/event-leads` | `eventLeads` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/analytics` | `organizerAnalytics` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/subscription` | `organizerSubscription` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/profile` | `organizerProfile` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizer/gallery` | `organizerGallery` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/organizers` | `organizerFollows` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/saved-exhibitions` | `savedExhibitions` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/notifications` | `notifications` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/platform` | `platform` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/public` | `public` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |
| `/api/pricing` | `pricing` | Requires route-file verification of auth/RBAC/ownership/rate-limit policy |

## Audit rule

For each mounted router, the audit must verify:

1. Authentication boundary.
2. Role/permission boundary.
3. Tenant/owner scoping for every resource lookup.
4. Mutation rate limiting.
5. Input validation.
6. Sensitive data exposure.
7. Idempotency/concurrency for financial or inventory mutations.
8. Audit logging for security-sensitive state changes.
9. Correct 4xx behavior for unauthorized/cross-tenant access.
10. Regression coverage for high-risk boundaries.

## Initial verified router families

The current code review has explicitly verified:

- `/api/business`: authenticated exhibitor-business access; business IDs are permission-derived.
- `/api/events`: authenticated organizer access; event queries are organizer-scoped.
- `/api/event-participants` family: authenticated organizer access; event lookup is organizer-scoped.
- `/api/payments`: authenticated ownership check; payment reads and verification resolve ownership from related booking/order records.
- `/api/leads`: authenticated exhibitor-business access; lead queries are scoped to permission-derived business IDs.
- `/api/event-ticket-check-ins`: authenticated scanner permission; event ownership is checked before transactional ticket mutation; duplicate/unpaid/unavailable cases are audited.

## Current evidence-backed verification status

The following high-risk families have now been verified against current main, with targeted regression coverage where a boundary required explicit evidence:

- `/api/exhibitions`, floor-plan routes, and `/api/bookings`: cross-organizer isolation verified by PR #184.
- `/api/organizer/payments`: cross-organizer payment/refund isolation verified by PR #185.
- `/api/event-tickets` inventory: cross-organizer list/update/archive isolation verified by PR #186.
- `/api/event-leads`: exhibitor tenant isolation for list/detail/update/archive/interactions/follow-ups verified by PR #160 and retained on current main; lead mutation rate limiting was established by PR #121.
- `/api/event-leads/capture-contexts`: exhibitor participation context isolation verified by PR #162.
- `/api/organizer/registrations`: cross-organizer registration settings/list/analytics/status isolation verified by PR #163.
- `/api/organizer/event-analytics` and `/api/organizer/analytics`: cross-organizer analytics isolation verified by PR #164.
- `/api/documents`: cross-exhibitor document list/download/delete isolation verified by PR #159.
- `/api/organizer-members` and `/api/exhibitor-members`: cross-tenant roster/mutation isolation verified by PR #182.
- Public floor-plan and storage reads: public read rate limiting verified by PRs #180 and #181.
- Platform-admin mutation rate limiting was established by PR #125; platform routes use the platform-admin authorization boundary.

These items should not be reopened as new implementation work unless the final route-level audit identifies a specific uncovered endpoint or regression.

## Remaining verification

The endpoint-specific high-risk families above are substantially covered. The remaining A1 work is concentrated in cross-cutting production security controls and final route-surface reconciliation rather than re-testing already-proven tenant boundaries.

### Remaining A1 closure work

1. Authentication flows: login/signup/OTP/reset abuse controls, enumeration resistance, session/JWT lifetime policy, and sensitive error behavior.
2. Public endpoints: complete the public route inventory and confirm every expensive read/write-like operation has an intentional rate-limit policy.
3. Platform administration: reconcile every mounted platform mutation against platform-admin authorization, validation, rate limiting, audit logging, and sensitive-data exposure.
4. Storage/upload hardening: MIME/content/size/filename/path handling and private/public storage separation.
5. Cross-cutting HTTP security: production CORS allowlist and security headers/CSP.
6. Request/body abuse controls: verify global and route-specific payload limits.
7. Sensitive production errors: verify production responses do not expose stack traces, SQL/provider details, credentials, or other internal implementation details.
8. Final route inventory reconciliation: compare `server/src/app.ts` with this document and produce evidence for every mounted prefix.

A1 exits only after these remaining controls and the complete mounted-route reconciliation have evidence-backed status.
