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


## A1 security checkpoint — 2026-11-24 04:13 IST

- Refund-webhook replay recovery PR [#962](https://github.com/Vijay-soni-ig/eventpass-india/pull/962) merged to main `40c4a0f`; exact-head CI, Migration Upgrade, Browser E2E and Dependency Audit passed. This is repository/mock evidence, not live provider verification.
- Open P2 [#963](https://github.com/Vijay-soni-ig/eventpass-india/issues/963) is a source-confirmed membership revocation/role-downgrade TOCTOU gap across participant document/media route families. In `eventParticipantDocuments.ts`, list/download/archive/restore and post-upload DB create re-resolve permissions but do not acquire the organizer row lock shared with membership mutations. The upload preflight is helpful but does not serialize the final create. In `eventParticipantMedia.ts`, list/download and reorder/update/archive/restore are not serialized with organizer membership changes; the upload transaction locks the participant row only, not the organizer row, and profile projection updates follow the transaction.
- Existing `phase63fParticipantDocuments.test.ts`, `participantDocumentMutationEventIsolation.test.ts`, `phase63aParticipantMedia.test.ts`, and `participantMediaMutationEventIsolation.test.ts` cover lifecycle, event/tenant boundaries, upload cleanup and archived-parent behavior, but inspected evidence does not show a concurrent revoke/downgrade regression. The risk is not a reproduced exploit.
- Proposed remediation: resolve the Event organizer; use `lockOrganizerForEntitlement`; re-read Event, active membership, suspension and permission under the lock; perform private object reads and database mutations while serialized. Uploads retain preflight, then final DB creation rechecks under the organizer lock and deletes the stored object if denied. Add deterministic concurrency tests for private download and mutation racing revocation/downgrade, including no orphan objects/no public projection update. No code or tests were run locally in this environment.
- A1 remains PARTIAL/OPEN; source-only findings are not security sign-off. Live runtime and penetration verification are separate.


## A1 security checkpoint — 2026-11-24 04:45 IST
- Main `40c4a0f34a3ba264a055e89c1491b2346bc0f798`. Organizer membership fixes #955 (invitation response redaction), #956 (member-directory revocation serialization), #958 (invitation reassignment guard), and #960 (membership lifecycle audit events) are merged. PR #962 also merged a refund-webhook replay recovery fix; exact-head CI/E2E/Audit were green. Main post-merge CI [45282474759](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45282474759) and Browser E2E [45282474818](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45282474818) SUCCESS; migration-upgrade on main was SKIPPED.
- Open source-confirmed issue [#963](https://github.com/Vijay-soni-ig/eventpass-india/issues/963): participant document/media read/upload/mutation paths can race organizer membership revocation or role downgrade because authorization is not serialized with the shared organizer-row lock. No runtime exploit reproduced. Existing event/tenant isolation and upload-cleanup tests do not establish concurrent revoke/downgrade safety for these route families.
- A1 remains **PARTIAL PASS / OPEN** (4–8h planning). Remaining route-family audit, focused concurrent revoke/downgrade regression and remediation for #963, IDOR/BOLA coverage, uploads/storage, rate-limit topology, sensitive-data review and deployed/penetration verification are not complete. Source observations are not route-level PASS; no route family is VERIFIED solely by this checkpoint.
- PR #964 documentation update is OPEN/UNMERGED. Exact-head CI [45283036026] (quality, backend shards 1–4, Migration Upgrade), Browser E2E [45283036043], and Dependency Audit [45283035901] all SUCCESS. Documentation checks do not constitute security sign-off.
- Next security action within A1: implement and test #963 using organizer-row lock + permission/membership revalidation for private reads/mutations, retaining upload preflight and object cleanup; add deterministic concurrency tests and require all exact-head checks. Overall highest release blocker remains P0 #925 runtime/log access.
- GitHub source/issues/PRs/Actions only; no local test runner, runtime, deployment, backend logs, browser, provider/scanner, target migration, backup restore or rollback accessed.


## Readiness/security refresh — 2026-11-24 05:45 IST
- Current main: `2b00e33f3365ebbeed832e923dd588e1f7ff417e`. PR #964 documentation refresh merged. The 05:45 baseline had no open PRs; PR #965 is now open for evidence refresh. Branch-protection API returned 403; rulesets endpoint returned `[]`, which does not prove classic protection absent. Required contexts and merge-blocking behavior remain **NOT VERIFIED**.
- Main CI [45291120098](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45291120098): backend shards 1–4 and quality SUCCESS; Migration upgrade path SKIPPED. Public-event [45291120402](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45291120402) SUCCESS. PR #964 exact head passed all 8 checks, including migration-upgrade and Dependency Audit; these are PR-head checks, not a main migration result.
- #963 remains OPEN. Current source review scope: 5 document handlers and 7 organizer-protected media handlers. Preflight permission checks do not serialize private reads/mutations with membership revocation or role downgrade. Media upload locks participant only, and profile photo projection occurs after media transaction. This is a TOCTOU risk, not a reproduced unauthorized request.
- Remediation acceptance: lock/re-read Event and organizer row; revalidate membership, suspension, and required permission within the shared lock; serialize private reads, create, reorder, update, archive and restore; preserve upload preflight and delete object on denied/failed persistence; add deterministic revoke/downgrade races, denied-write/public-visibility assertions and object-cleanup checks. Exact-head CI (backend shards, quality, migration upgrade, Browser E2E, Dependency Audit) must be green.
- A1 #926 remains incomplete: full handler-level review, IDOR/BOLA, upload/storage, rate-limit, sensitive-data, audit-log and deployment/penetration evidence not complete. #925 P0 runtime issue remains blocked on deployed Owner reproduction and correlated logs.
- Evidence is GitHub-only; no local test runner, runtime, deployment, logs, browser, provider/scanner, target migration, restore or rollback accessed. No code changed in this refresh.


## Notification route-family audit — 2026-11-24 08:11 IST

**Reviewed main:** `6fb8a17baa8e6d92f0e4aaf01c802ba637f70923`. Source-only review; no local tests run.

- `server/src/routes/notifications.ts`: router-wide `requireAuth`; list/unread count/read-all/mark-read scope to authenticated `userId`; list query validates page/limit/filter and caps limit at 50.
- Preference mutation accepts only boolean fields, rejects empty updates, upserts by user, logs an audit event and uses `profileMutationRateLimit`.
- Channel preferences use fixed channel enum, event-registry validation, authenticated user scope, parameterized SQL upsert and audit logging.
- Main CI [45307073301](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45307073301) shard 1 log contains passing tests for notification IDOR, invalid/missing token, mark-read idempotence, read-all/unread count, preference opt-out, and pagination (tests 240–244, 247).
- **Correction:** both `PATCH /read-all` and `PATCH /:id/read` attach `profileMutationRateLimit` in the reviewed source. The limiter is per authenticated user (30 requests/15 minutes). The static `routeRateLimitCoverage.test.ts` passed as test 276 in main CI [45307073301](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45307073301), shard 3. The prior claim that these routes were unthrottled was incorrect. A dedicated notification-specific 429 integration test and deployed/shared-store behavior remain not separately verified.

This source review does not close A1 or verify the notification family end-to-end.

## Notification throttling evidence correction — 2026-11-24 09:11 IST

- Reviewed the exact notification route blob present on the pre-correction main commit: `server/src/routes/notifications.ts`, blob `dfd56213a573462f07ba47ee06c9f6624e9466cf`.
- `PATCH /read-all` and `PATCH /:id/read` both include `profileMutationRateLimit` in their Express route middleware chain. Preference mutations use the same limiter.
- `server/src/middleware/rateLimit.ts` configures `profileMutationRateLimit` for 30 requests per 15 minutes, keyed by authenticated user ID (IPv6-safe IP fallback).
- `server/tests/routeRateLimitCoverage.test.ts` statically detects mutating routes without a named rate limiter; its test 276 passed in main CI run [45307073301](https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/45307073301), Backend tests shard 3.
- Therefore the 08:11 claim that notification read-state mutations were unthrottled was false and is superseded. No code fix is required for that alleged issue.
- Family classification remains PARTIAL: the broader A1 review is unfinished, there is no dedicated notification-specific 429 integration test in the reviewed test file, and production/shared-store rate-limit behavior is not verified from this repository-only evidence.


## Participant document/media remediation checkpoint — 2026-11-24 11:11 IST

### Documents — PR #968 merged
- Main merge commit: `dbfe62653d01fabb4d2ff9ff152072af6283495f`.
- Shared helper: `server/src/lib/lockedEventAccess.ts`; document route: `server/src/routes/eventParticipantDocuments.ts`.
- The helper locks the owning organizer row, re-reads the Event, active membership, organizer suspension and permission inside the transaction, then performs protected DB metadata/read/write work.
- For private downloads, the locked metadata lookup is the authorization linearization point. Object-storage I/O is performed after the DB transaction releases the lock; an already-authorized in-flight read may finish. This is intentional to avoid holding a DB transaction across S3/network I/O.
- Exact PR #968 head `110bd0c277caf2af5d3d016b545d49f8411925ec`: Quality, backend shards 1–4, Migration Upgrade, Browser E2E and Dependency Audit passed. Local test execution NOT TESTED.

### Media — PR #970 open
- Head: `b9ae09994f29d2ce8537be1ad9d317cced8d1ad6`.
- Applies the shared helper to organizer-protected media list, upload preflight/final persistence, reorder, update, archive, restore and private-file metadata lookup.
- Moves profile-image `photoUrl` projection updates into the same transaction as media create/archive/restore.
- Adds regressions for revoked private download, revoked archive, upload cleanup after revocation between preflight and persistence, and profile-image archive/restore projection consistency.
- Exact-head CI [45335609374], Browser E2E [45335609433], Dependency Audit [45335609522] were IN PROGRESS at 11:11 IST. Do not count as PASS until completed on this exact head.

Issue #963 remains OPEN until the media PR passes and merges. The complete A1 route-family review and deployed authorization/storage verification remain incomplete.
