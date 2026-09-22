# A1 Security Endpoint Inventory

**Audit date:** 2026-09-22  
**Main baseline:** `d6d19707899b29f3ede2e7c7e09faf302f60dc3b`

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

## Remaining verification

The inventory is not an assertion that every route is secure. Remaining router families must be reviewed against the audit rule above, with fixes/tests added for any deviation.

### Next focus

Prioritize resource-rich and high-impact routers:

1. Exhibitions / floor plans / bookings
2. Event leads / capture contexts
3. Organizer payments / refunds
4. Organizer members / exhibitor members
5. Event ticket inventory
6. Event registrations
7. Platform administration
8. Storage/documents
9. Analytics
10. Public endpoints and authentication flows

A1 exits only after the route inventory and these high-risk families have evidence-backed verification.