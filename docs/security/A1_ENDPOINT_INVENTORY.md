# A1 Security Endpoint Inventory

**Audit date:** 2026-09-24  
**Main baseline:** `32829ce06aefe977861199b6aaaab25147287189`

This inventory is derived from `server/src/app.ts` and identifies every mounted router prefix plus direct health endpoints. It is maintained as evidence-backed A1 security closure work.

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

## Mounted-route reconciliation — 2026-09-24

Compared `server/src/app.ts` on current main (`32829ce06aefe977861199b6aaaab25147287189`) with this inventory. All **36 unique mounted API prefixes** are represented in the inventory; `/api/exhibitions` and `/api/events` intentionally have multiple routers mounted under the same prefix. The direct `/api/health` and `/api/health/ready` endpoints are also listed above. No mounted API prefix is missing from this document.

This closes the **route-surface reconciliation** item. It does not by itself mark the individual router security controls complete; those remain subject to the evidence matrix below.

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

## Cross-cutting A1 evidence matrix

| Control | Evidence | Status |
|---|---|---|
| Authentication rate limiting | `/api/auth/signup` and `/api/auth/login` use the shared 20 requests / 15 minute `authRateLimit`; regression coverage in `server/tests/authRateLimit.test.ts`. | VERIFIED |
| Password policy | Signup enforces 12–128 characters plus lowercase, uppercase, number, and special character requirements via `passwordSchema`. | VERIFIED |
| Login error behavior | Unknown users and incorrect passwords return the same generic `Invalid email or password` response. | VERIFIED |
| JWT lifetime and claims | JWT lifetime is bounded to 24 hours; default is 8 hours. Issuer, audience, HS256, and unique JTI are enforced and covered by `jwtSecurity.test.ts` and `phase26_6AuthSessionHardening.test.ts`. | VERIFIED |
| Server-side auth sessions | Login creates an auth session; logout revokes the current JTI; logout-all revokes all user sessions; session TTL is fixed at 8 hours and revoked/expired sessions are rejected. | VERIFIED |
| CORS allowlist | Explicit `CORS_ORIGINS` is required in production; simple-request allowlist and OPTIONS preflight behavior are covered by `corsSecurityHeaders.test.ts` and PR #191. | VERIFIED |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP, and production HSTS are configured and regression-tested. | VERIFIED |
| Request/body limits | Global JSON body limit is 1 MB; payment webhook raw body limit is 100 KB; regression coverage exists in `requestBodyLimits.test.ts`. | VERIFIED |
| Production error sanitization | Production structured error logs exclude arbitrary error messages/stacks; `errorLogging.test.ts` verifies this behavior. | VERIFIED |
| Storage/upload boundary | Private document access is authenticated/tenant-scoped; public storage reads have dedicated rate limiting; upload/security boundary tests exist. Production S3 configuration is separately gated by deployment environment. | VERIFIED (repository) |
| Platform admin mutation controls | Platform router requires platform-admin access; mutation routes use `platformAdminMutationRateLimit`; CRUD/auth/audit regression coverage exists in `platformAdminCrud.test.ts`. | VERIFIED |
| Route-surface reconciliation | All mounted API prefixes and direct health endpoints are represented; duplicate prefixes are intentionally documented. | VERIFIED |

### Remaining A1 closure work

1. **Public endpoint policy reconciliation:** document evidence for every public router operation and confirm expensive public operations have intentional rate limits; implementation is substantially covered but the final evidence matrix is not yet complete.
2. **Storage production verification:** perform actual production/staging S3 configuration and access test; repository gate is covered, environment verification remains external.
3. **Deployment-level security verification:** verify production CORS origin values, TLS/domain, secrets, monitoring, backup/restore, and other environment/account controls outside this repository.

A1 exits only after the remaining evidence and deployment-level controls are explicitly classified as repository-verified or external production gates.
