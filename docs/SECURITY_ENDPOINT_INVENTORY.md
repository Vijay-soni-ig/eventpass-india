# ExhibitTix Security Endpoint Inventory

Updated: 2026-09-24

This is the repository-side A1 inventory baseline. It records every API prefix mounted by `server/src/app.ts` and the security controls that apply before route handlers run. It is an evidence document, not a claim that every individual handler has been manually re-reviewed.

## Global controls applied before route handlers

`server/src/app.ts` currently applies:

- Production `CORS_ORIGINS` is mandatory and origins are explicitly allowlisted.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: no-referrer`.
- `Permissions-Policy` disables camera, microphone and geolocation.
- A restrictive CSP with `default-src 'none'`, `frame-ancestors 'none'` and `base-uri 'none'`.
- HSTS in production.
- `X-Request-Id` plus structured request completion logging.
- JSON request body limit of 1 MB.
- Payment webhook raw-body limit of 100 KB.
- Generic production error responses that do not expose internal exception details.
- Exhibitor document uploads are not served as public static files.

## Mounted API surface

| Prefix | Route family | Primary security review focus |
|---|---|---|
| `/api/auth` | Authentication/session | credential abuse, session lifetime, revocation, brute-force limits |
| `/api/onboarding` | Account onboarding | tenant bootstrap and privilege boundaries |
| `/api/registrations` | Public/event registration | abuse limits and event-capacity integrity |
| `/api/organizer/registrations` | Organizer registration management | organizer authorization and tenant isolation |
| `/api/organizer/event-tickets` | Organizer ticket configuration | organizer authorization, inventory mutation limits |
| `/api/event-ticket-reservations` | Ticket reservations | authenticated ownership, inventory races, rate limits |
| `/api/event-ticket-orders` | Ticket orders/payment initiation | ownership, idempotency, payment abuse limits |
| `/api/event-tickets` | Issued tickets | ownership and event scoping |
| `/api/event-ticket-check-ins` | QR check-in | scanner authorization, single-use enforcement, high-throughput limits |
| `/api/organizer/event-analytics` | Organizer event analytics | tenant scoping and read isolation |
| `/api/business` | Exhibitor business | exhibitor membership/ownership and uploads |
| `/api/organizer-members` | Organizer team | membership authorization and mutation limits |
| `/api/exhibitor-members` | Exhibitor team | membership authorization and mutation limits |
| `/api/exhibitions` | Exhibition legacy/compatibility domain | organizer ownership, tenant isolation, mutation limits |
| `/api/events` | Universal Event domain | organizer ownership, tenant isolation, mutation limits |
| `/api/event-categories` | Public event categories | public read exposure and input validation |
| `/api/platform/event-categories` | Platform category administration | platform-admin authorization |
| `/api/bookings` | Legacy booking domain | ownership, inventory/payment abuse, tenant isolation |
| `/api/exhibitor/participations` | Exhibitor participation | exhibitor authorization and event/exhibition scoping |
| `/api/exhibitor/scanner` | Exhibitor scanner | exhibitor/event authorization and scanner limits |
| `/api/organizer/payments` | Organizer payment operations | organizer ownership, financial mutation limits |
| `/api/payments` | Payment operations | payment ownership, idempotency, verification limits |
| `/api/webhooks/payments` | Payment webhooks | signature verification, raw-body preservation, replay/idempotency controls |
| `/api/documents` | Exhibitor documents | ownership, destructive-operation limits, upload policy |
| `/api/leads` | Lead capture/management | exhibitor ownership and mutation limits |
| `/api/organizer/leads` | Organizer lead management | organizer ownership and tenant isolation |
| `/api/event-leads` | Universal Event lead domain | event scoping, exhibitor ownership, mutation limits |
| `/api/event-leads/capture-contexts` | Public lead capture contexts | public exposure, event scoping, abuse limits |
| `/api/organizer/analytics` | Organizer analytics | tenant-scoped reads |
| `/api/organizer/subscription` | Organizer subscription | organizer ownership and billing authorization |
| `/api/organizer/profile` | Organizer profile | organizer ownership and profile mutation limits |
| `/api/organizer/gallery` | Organizer gallery | organizer ownership and upload hardening |
| `/api/organizers` | Organizer follows | public/private boundary and mutation limits |
| `/api/saved-exhibitions` | Saved events/exhibitions | authenticated ownership and mutation limits |
| `/api/notifications` | Notifications | authenticated ownership and tenant scoping |
| `/api/platform` | Platform administration | super-admin authorization and privileged mutation limits |
| `/api/public` | Public discovery/content | public data boundary and discovery rate limits |
| `/api/pricing` | Public/commercial pricing | public read boundary and input validation |
| `/api/storage` | Storage/readiness operations | storage authorization and production configuration |
| `/api/health` | Liveness | intentionally public liveness signal |
| `/api/health/ready` | Readiness | intentionally public readiness signal; returns only readiness state |

## Repository security controls already verified

### Authentication/session policy

- JWT algorithm is restricted to HS256.
- Issuer and audience are verified.
- Tokens require both `userId` and `jti` claims.
- `JWT_EXPIRES_IN` defaults to 8 hours and is hard-capped at 24 hours.
- Authenticated requests validate the server-side auth session in addition to JWT verification.
- Suspended accounts are rejected.

### Abuse/rate limiting

The shared rate-limit middleware currently covers authentication/session mutations, public discovery, registration creation, booking creation, payment verification, financial mutations, platform-admin mutations, exhibition/event mutations, ticket reservations/orders/check-in, lead/document/team mutations, scanner flows, floor-plan mutations and other high-cost write paths.

### Upload hardening

Uploads are restricted to an explicit MIME allowlist, capped at 5 MB and one file per request, use random UUID filenames, reject unsupported types, and verify file magic bytes against the declared MIME type. S3 mode persists validated bytes to configured object storage and removes the temporary local copy. Exhibitor documents are not exposed through the public static upload path.

## Remaining A1 work

The inventory itself is now captured in-repository. The remaining A1 closure work is a route-handler-level evidence pass for every mounted family, specifically confirming:

1. authentication middleware placement for every non-public route;
2. resource ownership/tenant predicates for every read and mutation;
3. rate-limit attachment on every abuse-sensitive mutation;
4. webhook signature/replay controls;
5. upload middleware placement on every file endpoint;
6. explicit justification for intentionally public health/discovery/category/pricing routes.

This document must not be changed to PASS until those checks have repository evidence. External deployment gates remain separate from this A1 inventory.
