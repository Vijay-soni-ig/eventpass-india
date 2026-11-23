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


## Release/security checkpoint — 2026-11-24 02:13 IST
- Main is `d5107e08369978cfdb8e2c18d263503a91a1ab10`, merge commit of security PR #955. The invitation-hash response exposure tracked in #954 is now **FIXED ON MAIN**; #954 closed automatically. PR #955 exact-head CI [45253200895](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45253200895), Browser E2E [45253200939](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45253200939), and Dependency Audit [45253201265](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45253201265) all succeeded. CI included all four backend shards, quality, migration-upgrade and public-event checks.
- Post-merge main CI [45262451116](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45262451116) and Browser E2E [45262451122](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45262451122) were queued at this checkpoint; post-merge verification is **PENDING**, not PASS.
- P2 #953 organizer member-directory revocation race remediation is proposed in PR [#956](https://github.com/Vijay-soni-ig/eventpass-india/pull/956), head `5506bb13a064afe302e57e42bbeed1f0db0773d8`. It locks the organizer row, revalidates membership/suspension and view permission, and adds a revoked-membership regression. Exact-head CI was still running; local tests were not run.
- P2 #957 invitation reassignment guard is proposed in PR [#958](https://github.com/Vijay-soni-ig/eventpass-india/pull/958), head `e2646f3fca58337966cc0c1a180cae9a99c4d508`. It locks/re-reads organizer invitations and requires `userId: null` in both organizer and exhibitor acceptance flows, with regression coverage. Exact-head checks had not yet reported; local tests were not run.
- Security remains **PARTIAL/OPEN** under #926: #954 response redaction is merged, but #953/#957 remediation PRs are unmerged, broader handler-level A1 review and deployed/penetration verification remain incomplete.
- Sales/Payments #925 remains **BLOCKED** on a deployed Exhibitor Owner reproduction and correlated backend logs (endpoint, HTTP status, message, request ID, timestamp, tenant/role). No speculative financial code changes.
- Lifecycle #930/#931, production/staging configuration, target migration, monitoring/alerts, backup restore/rollback, manual accessibility/responsive/performance validation, and final release-candidate regression remain unverified or open. The existing planning estimate is unchanged at 24–50 focused hours; it is not a measurement of current remaining work.
- Evidence boundary: GitHub source/issues/PRs/Actions only; no live runtime, deployment, backend logs, local test runner, provider/scanner, target migration, restore or rollback was accessed.


## Security evidence refresh — 2026-11-24 03:11 IST
- PR #958 invitation-assignment guard (#957) merged at `1a7ec9edc536a8813ed06585d8cece2257487f1a`; PR #956 organizer member-directory revocation serialization (#953) merged at `3445b8c87139549f0b99eca15e951451e1beab67`. Both exact-head CI/backend shards/quality/migration upgrade/Browser E2E/Dependency Audit were green; focused regressions passed. This is repository evidence, not deployment or full A1 sign-off.
- Post-merge main CI [45272516256](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45272516256) succeeded for backend shards 1–4 and quality; migration upgrade was SKIPPED. Public-event E2E [45272516246](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45272516246) is still IN PROGRESS. Monitoring run [45272844539](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45272844539) reports NOT CONFIGURED and skips health.
- Organizer membership audit gap #959 is being addressed in PR #960 (head `8c451d7e4eb81f9e9f86edd5964196d811f3c0be`): invite, role change, acceptance and removal events with safe metadata, plus a lifecycle regression asserting token/hash material is absent. Exact-head workflows are RUNNING/QUEUED; local execution was not possible because the terminal has no GitHub network/DNS.
- A1 route-family audit remains PARTIAL/OPEN: these scoped fixes do not complete authentication/account enumeration, payment/webhook, documents/uploads, ticket lifecycle, remaining mutation route families, cross-tenant BOLA/IDOR, abuse/rate-limit, sensitive-error and deployed/penetration coverage. #925 runtime Sales/Payments failure remains blocked by missing Owner repro and correlated logs.


## Release sprint checkpoint — 2026-11-24 03:24 IST
- Current main `3445b8c87139549f0b99eca15e951451e1beab67`: CI [45272516256](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45272516256) SUCCESS (backend shards 1–4 + quality); Browser E2E [45272516246](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45272516246) SUCCESS. Migration upgrade on main was SKIPPED; monitoring diagnostic [45272844539](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45272844539) reports NOT CONFIGURED.
- A1 source review slices added to issue #926: organizer participant CRUD families (partners/speakers/sponsors/staff) and Universal Event reservations/orders/check-in. No confirmed cross-tenant defect in these slices; existing tests cover tenant boundaries, module gates, reservation idempotency/capacity/max-per-attendee, payment ownership, and single-use concurrent check-in. Runtime/penetration verification remains NOT TESTED.
- Payments/webhooks source review identified P1 retry gap #961: a `refund.processed` webhook event is recorded before local finalization; duplicate deliveries short-circuit while the refund is still PROCESSING/REQUESTED, so a transient finalization failure can leave local financial state pending. Provider refund reconciliation exists in source but the current CLI only invokes local `reconcilePayments`; no automatic invocation was found in the inspected tree. Issue [#961](https://github.com/Vijay-soni-ig/eventpass-india/issues/961).
- Fix PR [#962](https://github.com/Vijay-soni-ig/eventpass-india/pull/962) opened from main at head `83a9fcf9489a08ce0889a7fc1899f8c33073be4b`: retry idempotent refund finalization on duplicate events while the refund remains non-terminal; parse refund amount in mock webhook; add regression and cleanup. Diff reviewed (3 files). Local tests NOT TESTED; exact-head checks pending.
- PR [#960](https://github.com/Vijay-soni-ig/eventpass-india/pull/960) organizer membership audit logging: CI [45273376461](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45273376461) SUCCESS incl. migration-upgrade/backend shards/quality; Dependency Audit [45273376369](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45273376369) SUCCESS; Browser E2E [45273376337](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45273376337) still IN PROGRESS. Do not merge until E2E and scope review complete.
- Documentation PR #952 exact head `deb0777bfb03f399a505f7514fe9d667228fb05e`: CI [45273501816](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45273501816), Browser E2E [45273501754](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45273501754), Dependency Audit [45273501971](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45273501971) SUCCESS. This new documentation commit will require fresh exact-head checks before merge.
- P0 #925 remains BLOCKED on a deployed Exhibitor Owner reproduction and correlated server logs; #930 standalone Event exhibitor participation and #931 linked Exhibition ticketing cutover remain OPEN. Production/staging configuration, monitoring, backup/restore/rollback, manual accessibility/responsive/performance, and release regression remain NOT VERIFIED. Previous 24–50h estimate is stale planning only; no fresh task-level estimate in this run.
- Evidence boundary: GitHub source, issues, PRs and Actions only. No local test runner, live runtime, deployment, provider/scanner, production migration, backup restore or rollback accessed. No production data changes.


## Security/payment evidence checkpoint — 2026-11-24 03:46 IST

- Organizer membership audit logging fix PR #960 is MERGED into main `195e96c346616e9cd4dc25fe483dac6d34753bf3` and closes #959. It adds secret-free organizer invite-sent, invitation-accepted, role-changed and revoked audit events. Exact-head CI (backend shards 1–4, quality, Migration Upgrade), public-event E2E, and Dependency Audit passed. Main CI [45275874504] passed backend shards and quality; migration-upgrade skipped. Main Browser E2E [45275874554] passed.
- Payment/webhook source review identified P1 #961: a persisted duplicate `refund.processed` event could short-circuit before retrying local refund finalization after a prior transient failure. PR #962 at head `83a9fcf9489a08ce0889a7fc1899f8c33073be4b` retries idempotent finalization only for REQUESTED/PROCESSING, leaves terminal duplicates no-op, fixes mock refund-amount parsing, and adds a regression for the already-recorded-event/pending-refund state. Exact-head backend CI [45275415630], Dependency Audit [45275415808], and Browser E2E [45275415984] are SUCCESS, including Migration Upgrade. The test simulates persisted event state; it is not a real database outage or provider certification. PR is open, mergeable, and its base is one commit behind main (#960); update base and rerun checks before merge. Issue #961 remains open.
- A1 #926 is still incomplete: route-family audit and deployed/penetration evidence for auth/session abuse, payments/webhooks, uploads/storage, ticket/order/check-in, remaining mutation families, IDOR/BOLA, rate limits, PII and audit-log behavior remain open. #925 Sales/Payments deployed runtime failure remains unroot-caused; no actual status/message/request ID or correlated server logs available.
- No live provider, deployment, runtime, local runner, manual browser, scanner, target migration, backup restore, or rollback was accessed.
