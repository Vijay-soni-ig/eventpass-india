# A1 Route Review Evidence Ledger

Updated: 2026-09-24

## Purpose

This ledger records repository-verifiable evidence gathered during the A1 route-family security review. It is deliberately narrower than the full A1 matrix and does not convert unreviewed route families into PASS.

## Verified controls

### Authentication/session policy

- `docs/JWT_SESSION_SECURITY_POLICY.md` documents the JWT/session lifetime policy.
- The current main branch contains this policy as a dedicated security artifact.
- The route-family matrix therefore treats session lifetime as documented evidence, while brute-force and enumeration behavior remain route-specific review items.

### Payment webhooks

`server/src/routes/paymentWebhooks.ts` currently provides the following repository-visible controls:

1. Provider path allowlisting: requests for a provider other than the configured provider return `404`.
2. Signature verification occurs against the raw request body before webhook parsing or financial mutation.
3. Invalid signatures return `400` and do not enter payment state mutation.
4. Invalid webhook payloads are rejected with `400`.
5. Stable provider event IDs are recorded through `recordWebhookEvent`.
6. Duplicate webhook events return success without reapplying financial state.
7. Refund webhooks reconcile only against an existing local refund identified by `providerRefundId`.
8. Unknown refund references are acknowledged without inventing local financial state.
9. Payment outcomes are applied only after the webhook has passed signature and duplicate-event handling.

These controls support the payment/webhook threat-model requirements for signature authenticity, replay handling and conservative reconciliation. They do not prove live Razorpay verification, because live provider credentials and a real provider callback are still external launch dependencies.

## Remaining A1 review work

The following route families remain `Review required` in `docs/A1_ROUTE_FAMILY_SECURITY_MATRIX.md` until focused route-level regression evidence is available:

- authentication and account abuse controls
- bookings and reservations
- documents/uploads
- event partner/speaker/sponsor/staff mutations
- ticket check-in, orders, reservations and issuance
- vendors and exhibitor scanner
- notifications and onboarding
- organizer follows/gallery/members/profile/payments/subscriptions
- payments and remaining payment mutation paths

## Evidence rule

A source inspection is not equivalent to a passing security regression. A family becomes VERIFIED only after the relevant authorization, tenant scope, validation, abuse-control, sensitive-data, concurrency/idempotency and regression-test properties have concrete repository evidence.

## External dependency boundary

Live Razorpay verification remains BLOCKED until an actual provider account/credential and a credentialed sandbox callback test are available. Repository tests can validate provider abstraction and signature/idempotency logic, but must not be represented as live-provider verification.


## Additional source review checkpoint — 2026-11-24

**Baseline:** main `5d23060ed2c4a5e3b3632ade9ca1a13b3e79eb82`. Exact-main CI [45239926526](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45239926526) and Browser E2E [45239926466](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45239926466) report SUCCESS. This is repository CI evidence, not deployed runtime or penetration-test evidence.

### Authentication/session
- `auth.ts` returns the same generic 401 for unknown email and wrong password on login.
- Signup returns 409 with a distinct existing-account response. This is an account-enumeration response differential; exploitability is not established and any mitigation needs a product decision.
- Login/signup are IP-keyed and limited over a 15-minute window; `a1AuthRateLimit.test.ts` verifies repeated login attempts eventually return 429.
- `requireAuth` validates the token, persisted session, user existence and suspended status before attaching `req.user`.

### Ticket reservations and check-in
- `eventTicketReservations.ts` requires authentication and rate-limits creation/cancellation. Creation locks the ticket-type row, rechecks event publication/visibility, ticketing module and sale window, checks per-order/per-attendee and capacity limits, and handles buyer-scoped idempotency-key replay/payload mismatch. Cancellation locks the buyer-scoped reservation and rejects inactive or already-ordered reservations.
- `eventTicketCheckIn.ts` enforces scanner permission, organizer ownership and CHECK_IN module; rate-limits scanning; locks Payment and Ticket and checks paid order/payment, pending refund, active ticket and event availability before mutation. The summary exposes only the latest 20 scans.
- Relevant existing tests: `eventTicketReservationLifecycleConcurrency.test.ts`, `p0TicketReservationConcurrency.test.ts`, `eventTicketCheckInRbac.test.ts`, `eventTicketCheckInSummaryIsolation.test.ts`, and `eventTicketCheckInRejectionMatrix.test.ts`. These test files were inspected but not executed locally during this checkpoint.

### Documents/uploads
- `documents.ts` requires authentication/exhibitor access, validates explicit business selection for multi-business accounts, and checks document-manage permission before Multer processes bytes. Private list/download paths are tenant scoped; reads recheck membership/permission under the business-row lock. Download responses are attachment, private/no-store, and `nosniff`; the request Host header is not reflected into private URLs. Archive/restore preserves records and is constrained by KYC state; mutations are audited.
- `upload.ts` allows PDF/JPEG/PNG/WebP, limits one file and 5 MB (2 MB logo), checks magic bytes against MIME, scans with clamd, and cleans files on rejection/persistence failure. Production requires S3 and malware-scan configuration.
- Existing tests include `documentAuthorization.test.ts`, `exhibitorDocumentLifecycle.test.ts`, `participantDocumentMutationEventIsolation.test.ts`, `uploadMalwareMiddleware.test.ts`, `uploadSecurityBoundary.test.ts`, and production storage config tests. They were not executed locally.

### Webhook/deployment boundary
- `app.ts` mounts payment webhook raw-body parsing with a 100 KB limit; `paymentWebhooks.ts` verifies signature before parsing, deduplicates events and validates payment/refund identity, amount and currency. No route-local webhook limiter is visible. Edge/WAF/provider-source abuse protection and alerting remain deployment evidence to verify; avoid a naive throttle that interferes with provider retries.
- `docs/security/RATE_LIMIT_TOPOLOGY.md` states the in-memory rate-limit store requires a single API instance in production with explicit topology configuration; horizontal scaling is blocked until a shared store is implemented.

### Evidence boundary
This checkpoint is source review only. No local server, database, browser or test runner is available here. Nothing above is marked PASS solely from inspection; the A1 matrix remains PARTIAL/OPEN. Live webhook/provider behavior and deployed proxy/storage/clamd configuration remain NOT VERIFIED.

**Next audit slice:** organizer/exhibitor membership mutation, invitations, participant CRUD, and route-level permission/tenant tests. Keep #925 P0 runtime reproduction separate; it still requires a deployed Owner session and correlated backend logs.
