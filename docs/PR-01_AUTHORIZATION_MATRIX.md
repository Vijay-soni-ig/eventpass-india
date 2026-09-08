# PR-01 Authorization / IDOR-BOLA Matrix

## Security rule

`userType` is not an authorization grant. Tenant entry is membership-based; resource access is permission-based; platform-wide access is `platformRole === super_admin`.

Every endpoint that accepts a resource ID must derive the tenant/resource relationship server-side. Client-supplied organizer/business IDs must never decide which tenant is authorized.

## Route-family matrix

| Route family | Primary tenant axis | Required boundary | IDOR/BOLA expectation | Status |
|---|---|---|---|---|
| `/api/exhibitions/*` | Organizer | Active organizer membership + route permission | Exhibition must belong to an organizer resolved from caller permissions | PASS / regression added |
| `/api/organizer/*` | Organizer | Active organizer membership + route permission | Organizer ID in URL/body cannot cross tenant boundary | PASS / existing security coverage |
| `/api/exhibitor/*` | Exhibitor business | Active exhibitor membership + route permission | Business/participation/exhibition data must resolve from caller's businesses | PASS / regression added |
| `/api/bookings/*` | Visitor ownership or Organizer scanner tenant | Buyer ownership for visitor endpoints; organizer permission for scanner | Booking ID/QR cannot expose another visitor or unrelated organizer | PASS / existing ownership + scanner coverage |
| `/api/leads/*` | Exhibitor business / event | Caller business membership or organizer permission as applicable | Lead must be reachable through authorized business/event relationship | PASS / existing security coverage |
| `/api/organizer/leads/*` | Organizer | Organizer permission | Exhibition/lead IDs must belong to an authorized organizer | PASS / existing coverage |
| `/api/organizer/analytics/*` | Organizer | Organizer permission | Analytics queries must be filtered by authorized organizer IDs | PASS |
| `/api/organizer/payments/*` | Organizer | Organizer permission | Payment/order/refund data must be tenant-scoped | PASS / payment security suite |
| `/api/organizer/subscription/*` | Organizer | Organizer membership/owner permission | Subscription must be resolved from authorized organizer, never arbitrary ID | PASS / subscription security suite |
| `/api/organizer/profile/*` | Organizer | Organizer membership + profile permission | Profile/media changes must remain within authorized organizer | PASS |
| `/api/organizer/gallery/*` | Organizer | Organizer membership + gallery permission | Gallery/media IDs cannot cross organizer | PASS |
| `/api/organizer/members/*` | Organizer | Organizer membership + team permission | `:organizerId` must belong to caller | PASS / explicit cross-tenant test |
| `/api/exhibitor/members/*` | Exhibitor business | Exhibitor membership + team permission | `:businessId` must belong to caller | PASS |
| `/api/exhibitor/participations/*` | Exhibitor business + confirmed participation | Exhibitor membership + participation relationship | Participation/exhibition IDs cannot expose another business | PASS / explicit cross-business payment test |
| `/api/exhibitor/scanner/*` | Confirmed exhibitor participation | Exhibitor membership + confirmed participation + scanner permission | Scanner cannot operate against unrelated exhibitions | PASS / existing Phase 21B coverage |
| `/api/platform/*` | Platform | `super_admin` | Platform IDs are globally authorized only for platform admins | PASS / platform admin suite |
| `/api/payments/*` | Authenticated payment owner / authorized organizer | Payment ownership or organizer permission | Payment ID must not permit another user's payment access | PASS / payment security suite |
| `/api/payment-webhooks/*` | Payment provider | Signature verification, raw body, idempotency | No user-controlled tenant authorization; provider event must resolve server-side | PASS foundation; production provider verification still required |
| `/api/public/*` | Public | Published/public visibility rules | Only intentionally public event/content fields are returned | PASS / discovery and detail tests |
| `/api/saved-exhibitions/*` | Visitor ownership | Authenticated user | Save ID cannot expose or mutate another user's save | PASS / Phase 23.3 coverage |
| `/api/notifications/*` | User ownership | Authenticated user | Notification ID must belong to caller | PASS |
| `/api/business/*` | Exhibitor business | Owner/membership permission | Business ID must resolve to caller's business | PASS |
| `/api/pricing/*` | Public/configuration | Public read or platform authorization as defined | No mutable tenant pricing through public endpoints | PASS |
| `/api/auth/*` | User identity | Authentication/session rules | User identity comes from verified credentials/token, never request user ID | PASS |

## Critical regression discovered and fixed

Previously `requireOrganizerAccess()` admitted any user whose signup-time `userType` was `exhibitor`, even without an organizer membership. Because the exhibition creation route can bootstrap an organizer when an authenticated user has no organizer membership, this created a role-boundary escalation path: a pure exhibitor could reach the organizer route gate and potentially trigger organizer bootstrap.

The fix makes both tenant entry gates membership-authoritative:

- Organizer routes require an active `OrganizerMembership`.
- Exhibitor-business routes require an active `ExhibitorMembership`.
- `userType` is informational and never substitutes for tenant membership.
- Existing centralized `can()` permission checks remain responsible for operation-level authorization.

Regression coverage is in `server/tests/pr01AuthorizationBoundaries.test.ts`.

## Required tests for every future ID-bearing endpoint

1. Authenticated owner can access own resource.
2. Same-role user from tenant B cannot access tenant A resource.
3. Visitor cannot access organizer/exhibitor resources.
4. Exhibitor cannot access organizer resources unless they have a real organizer membership.
5. Organizer cannot access exhibitor-business resources unless they have a real exhibitor membership.
6. Changing only the URL/body resource ID cannot cross the tenant boundary.
7. Changing IDs in query parameters cannot cross the tenant boundary.
8. Missing/deleted/archived resources return a non-enumerating response where appropriate.
9. Suspended users/businesses/organizers lose effective access immediately.
10. Platform admin access is explicit and never inferred from ordinary tenant membership.

## Production gate

This matrix is a security review artifact, not proof that every endpoint has been dynamically fuzz-tested. Before production launch, run the full authorization regression suite plus targeted BOLA testing against every route family and every ID-bearing endpoint, including query/body/path IDs and bulk operations.
