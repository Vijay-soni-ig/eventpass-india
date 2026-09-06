# EVENTPASS V2 — Database Integration Test Checklist

Developer-facing manual test checklist for exercising EVENTPASS V2 against a
real PostgreSQL database. Every test below assumes:

- A live Postgres instance, migrations applied (`npx prisma migrate deploy`
  from `server/`).
- The dev seed loaded (`npx prisma db seed` from `server/` — see
  `server/prisma/seed.ts`). All seed users share the password
  `DevPassword123!`.
- The server running (`npm run dev` in `server/`) against that database.
- `PAYMENT_PROVIDER=mock` in `server/.env` (the default) unless a test
  explicitly says otherwise.

Seed reference used throughout this checklist:

| Role | Email | Notes |
|---|---|---|
| Platform admin | `platform.admin@eventpass.test` | `platformRole: super_admin` |
| Organizer 1 owner | `org1.owner@eventpass.test` | Organizer: "Bengaluru Expo Collective" |
| Organizer 1 admin/ops/finance/marketing/scanner | `org1.{admin,ops,finance,marketing,scanner}@eventpass.test` | One user per `OrganizerMemberRole` |
| Exhibitor Biz1 owner/admin/staff | `biz1.{owner,admin,staff}@eventpass.test` | "Nimbus Robotics Pvt Ltd" — `confirmed` participation, stall `A-01` sold |
| Exhibitor Biz2 owner/staff | `biz2.{owner,staff}@eventpass.test` | "GreenLeaf Organics" — `payment_pending` participation, stall `A-03` reserved |
| Exhibitor Biz3 owner | `biz3.owner@eventpass.test` | "Aarohi Textiles" — `applied`, no stall |
| Exhibitor Biz4 owner | `biz4.owner@eventpass.test` | "Solstice Renewable Energy" — `rejected` |
| Exhibition | — | `seed-exhibition-1`, "Bengaluru Tech & Startup Expo 2026", status `live`, visibility `public` |

For each test: **Preconditions**, **Action**, **Expected result**, **Failure condition**.

---

## 1. Database connectivity

**1.1 — Server boots against a live database**
- Preconditions: Postgres reachable, `DATABASE_URL` correct.
- Action: `npm run dev` in `server/`.
- Expected: Console prints `API server listening on http://localhost:4000`; `GET /api/health` returns `{"ok":true}`.
- Failure: Startup throws, or `/api/health` hangs/errors — check `DATABASE_URL` and that Postgres is actually listening (`pg_ctl status` / `netstat`).

**1.2 — Server survives a DB hiccup without crashing**
- Preconditions: Server running.
- Action: Stop Postgres (`pg_ctl stop`) while the server is up, then hit any DB-backed route.
- Expected: That single request fails with a 500; the Node process itself stays alive (does not exit).
- Failure: The whole process crashes/exits — regression in the `unhandledRejection` safety net in `server/src/index.ts`.

---

## 2. Migrations

**2.1 — Clean migrate on an empty database**
- Preconditions: A fresh, empty Postgres database.
- Action: `npx prisma migrate deploy`.
- Expected: All 9 migrations apply in order with no errors; `npx prisma migrate status` reports "Database schema is up to date!".
- Failure: Any migration errors out, or `migrate status` reports drift.

**2.2 — Table/enum shape matches schema**
- Preconditions: Migrations applied.
- Action: `psql -c "\dt"` and spot-check `\d leads`, `\d payments`.
- Expected: 18 app tables + `_prisma_migrations` exist; enum columns (`status`, `priority`, etc.) match `schema.prisma`'s current enum values.
- Failure: Missing table/column, or an enum with stale values from a pre-remap migration.

---

## 3. Authentication

**3.1 — Signup creates a real user**
- Action: `POST /api/auth/signup` with a new email/password/fullName/userType.
- Expected: `201`, returns `{token, user}`; `user` never includes `passwordHash`; a row exists in `users` with a bcrypt hash (not plaintext).
- Failure: Plaintext password stored, or `passwordHash` leaks into the response.

**3.2 — Duplicate signup is rejected**
- Preconditions: An existing user (e.g. seed's `org1.owner@eventpass.test`).
- Action: `POST /api/auth/signup` with that same email.
- Expected: `409 { error: "An account with this email already exists" }`.
- Failure: `500`, or a second user row created (should be impossible — `email @unique`).

**3.3 — Login succeeds/fails correctly**
- Action: `POST /api/auth/login` with `org1.owner@eventpass.test` / `DevPassword123!`, then again with a wrong password.
- Expected: Correct password → `200` with token; wrong password → `401 { error: "Invalid email or password" }` (same generic message as unknown-email, no user enumeration).
- Failure: Different error messages for "wrong password" vs "unknown email" (enumeration leak).

**3.4 — `/me` reflects real role context**
- Action: `GET /api/auth/me` as `org1.owner@eventpass.test`.
- Expected: `roles.organizer` includes the seed organizer with role `owner`; `roles.platformAdmin` is `false`.
- Failure: Roles missing/wrong, or stale after a membership change.

---

## 4. Organizer

**4.1 — Organizer roster visible to any active member**
- Action: `GET /api/organizer-members/seed-organizer-1` as `org1.scanner@eventpass.test`.
- Expected: `200`, full member list (7 memberships including the pending invite).
- Failure: `403`/`404` for a legitimate low-privilege member, or the pending invite missing.

**4.2 — Only owner/admin can invite**
- Action: `POST /api/organizer-members/seed-organizer-1` as `org1.scanner@eventpass.test` (should fail), then as `org1.owner@eventpass.test` (should succeed) with a new `invitedEmail`.
- Expected: Scanner → `403`; owner → `201`, new membership with `status: "invited"` (no matching user yet).
- Failure: Scanner succeeds, or the invite silently activates without a matching user account.

**4.3 — First-use organizer bootstrap**
- Preconditions: A brand-new user with zero `OrganizerMembership` rows.
- Action: That user creates an exhibition (`POST /api/exhibitions`) for the first time.
- Expected: A new `Organizer` + `owner` `OrganizerMembership` is created for them automatically; a second exhibition-create call reuses the same organizer (no duplicate).
- Failure: A duplicate organizer created on a second call, or the user is denied outright.

---

## 5. Exhibitor

**5.1 — Exhibitor business profile visibility by role**
- Action: `GET /api/business` as `biz1.staff@eventpass.test` (staff, view-only) vs `biz1.owner@eventpass.test`.
- Expected: Both `200`; staff's response has `bankAccountName`/`bankAccountNumber`/`bankIfsc`/`gst`/`pan` **nulled out**; owner's response has them populated.
- Failure: Staff sees bank/tax fields — regression of the security-audit fix in `server/src/routes/business.ts`.

**5.2 — Only owner/admin can edit the business profile**
- Action: `PUT /api/business` as `biz1.staff@eventpass.test`.
- Expected: `403`.
- Failure: `200` — staff should not hold `exhibitorBusiness:manage`.

**5.3 — First-use exhibitor business bootstrap**
- Preconditions: A brand-new exhibitor user with zero `ExhibitorMembership` rows.
- Action: That user applies to the seed exhibition (`POST /api/exhibitor/participations`).
- Expected: A new `ExhibitorBusiness` + `owner` `ExhibitorMembership` is created automatically; a second apply-type call for that user reuses the same business.
- Failure: Duplicate business created, or an unhandled error (see §25.2 for the concurrent case).

---

## 6. Exhibition

**6.1 — Public listing only shows live+public exhibitions**
- Action: `GET /api/public/exhibitions` (unauthenticated).
- Expected: Includes "Bengaluru Tech & Startup Expo 2026"; a `draft` or `private` exhibition (create one via the organizer API to test) does not appear.
- Failure: A draft/private exhibition leaks into the public listing.

**6.2 — Exhibition detail exposes only available stalls**
- Action: `GET /api/public/exhibitions/seed-exhibition-1`.
- Expected: `stalls` array contains only `status: "available"` stalls (6 of the 8 seeded — `A-01` sold and `A-03` reserved are excluded).
- Failure: Sold/reserved stalls appear as bookable.

**6.3 — Cross-tenant exhibition edit is denied**
- Preconditions: A second organizer (create one, or use a freshly-bootstrapped test account) that does **not** manage `seed-exhibition-1`.
- Action: `PUT /api/exhibitions/seed-exhibition-1` as that other organizer's owner.
- Expected: `404` (not `403` — existence isn't confirmed to a non-member either).
- Failure: `200`, or a `403` that still confirms the exhibition exists.

---

## 7. Stalls

**7.1 — Stall statuses match seed**
- Action: `GET /api/exhibitions/seed-exhibition-1` as `org1.owner@eventpass.test`.
- Expected: `A-01` = `sold`, `A-03` = `reserved`, remaining 6 = `available`.
- Failure: Any mismatch, or a stall missing its `exhibitionExhibitorId` link.

**7.2 — Concurrent stall claim** — see §25.1 (Concurrency Test A).

---

## 8. Ticket booking

**8.1 — Free ticket skips payment entirely**
- Action: `POST /api/bookings/tickets` as any visitor with `ticketTypeId: seed-tickettype-general`.
- Expected: `201`; `payment.status === "paid"`, `payment.provider === "free"`, `order === null`, no gateway order created.
- Failure: A gateway order is created for a ₹0 ticket, or `paymentStatus` isn't immediately `paid`.

**8.2 — Priced ticket starts unpaid**
- Action: `POST /api/bookings/tickets` with `ticketTypeId: seed-tickettype-standard`.
- Expected: `201`; `booking.paymentStatus === "created"`; a `Payment` row with `status: "created"` and a `providerOrderId`.
- Failure: `paymentStatus` is already `"paid"` before any verify/webhook call — would mean the booking trusts the client.

**8.3 — Invalid ticket type / wrong exhibition is rejected**
- Action: `POST /api/bookings/tickets` with a `ticketTypeId` that belongs to a different exhibition than the `exhibitionId` given.
- Expected: `404 { error: "Ticket type not found" }`.
- Failure: `500`, or the booking is created against the mismatched pair.

**8.4 — Malformed date no longer crashes the process**
- Action: `POST /api/bookings/tickets` with `visitDate: "not-a-date"`.
- Expected: `400`, clean validation error. Server keeps running; a second, valid request immediately after still succeeds.
- Failure: Hang, 500 with a stack trace leaking to the client, or the process exits (regression of the security-audit `dateString` fix).

---

## 9. Mock payment

**9.1 — Mock-complete flips a payment to paid**
- Preconditions: A `created`-status priced ticket booking (e.g. re-run 8.2), `PAYMENT_PROVIDER=mock`.
- Action: `POST /api/payments/:id/mock-complete` with `{ "outcome": "success" }`, using the buyer's own token.
- Expected: `200`; `payment.status === "paid"`; the linked `TicketBooking.paymentStatus` also becomes `"paid"`.
- Failure: Payment stays `created`, or another user's token can call this on someone else's payment (must be owner-scoped).

**9.2 — Mock-complete is provider-gated**
- Preconditions: `PAYMENT_PROVIDER` temporarily set to `razorpay` (with valid-looking but fake keys, or just check the code path) — or reason about it statically if you don't want to restart the server.
- Action: `POST /api/payments/:id/mock-complete`.
- Expected: `403 { error: "Mock payment completion is only available when PAYMENT_PROVIDER=mock" }`.
- Failure: Succeeds regardless of configured provider.

---

## 10. Payment verification

**10.1 — Checkout-callback signature verify (mock)**
- Preconditions: A `created` payment with a `providerOrderId`.
- Action: `POST /api/payments/:id/verify` with a validly HMAC-signed `{providerOrderId, providerPaymentId, signature}` (compute with `MOCK_PAYMENT_SECRET`), then again with a tampered signature.
- Expected: Valid signature → `200`, `payment.status === "paid"`. Tampered signature → `400`, payment flips to `"failed"` with a `failureReason`, never silently ignored.
- Failure: A tampered/forged signature is accepted.

**10.2 — Order-id mismatch is rejected**
- Action: `POST /api/payments/:id/verify` with a `providerOrderId` that doesn't match the payment's actual order id.
- Expected: `400 { error: "Order mismatch" }`.
- Failure: Accepted despite the mismatch.

---

## 11. Payment webhook

**11.1 — Valid webhook applies the outcome**
- Action: `POST /api/webhooks/payments/mock` with a correctly-signed body (`x-mock-signature` header) whose `eventType` is `payment.captured` and `providerOrderId` matches a real `created` payment.
- Expected: `200 { received: true }`; the payment transitions to `paid`.
- Failure: Payment doesn't transition, or the raw body was re-serialized before signing (breaks the whole mechanism) — check `express.raw()` is still mounted before `express.json()` in `index.ts`.

**11.2 — Invalid signature is rejected**
- Action: Same as 11.1 but with a wrong/missing signature header.
- Expected: `400 { error: "Invalid webhook signature" }`; payment untouched.
- Failure: `200`, or payment transitions despite the bad signature.

**11.3 — Unknown provider order id is a no-op, not a crash**
- Action: A validly-signed webhook whose `providerOrderId` matches no `Payment` row.
- Expected: `200 { received: true }` (acknowledged so the gateway doesn't retry forever), no `PaymentEvent`/`Payment` mutation tied to a real payment.
- Failure: `500`.

---

## 12. Webhook idempotency

**12.1 — Duplicate delivery is a no-op**
- Preconditions: A `created` payment.
- Action: Deliver the exact same valid webhook payload (same `providerEventId`/order id) twice in a row.
- Expected: First call → `200`, payment transitions to `paid`. Second call → `200 { received: true, duplicate: true }`, payment stays `paid`, no double-processing, no second `PaymentEvent` row (unique `(provider, providerEventId)` catches the `P2002`).
- Failure: Second call errors, or re-applies the outcome (e.g. would double-confirm a stall).

**12.2 — Duplicate after checkout-verify already confirmed it**
- Action: Verify a payment via 10.1 first (client-side confirm), then deliver the webhook for the *same* payment/event.
- Expected: Webhook is accepted (`200`) but is a no-op (`ALREADY_TERMINAL` internally) — no error, no re-processing.
- Failure: `500`, or a duplicate stall/ticket confirmation side effect fires twice.

---

## 13. Visitor registration

**13.1 — Signup as visitor, buy a ticket, list "my tickets"**
- Action: Signup with `userType: "visitor"`, buy a free ticket, `GET /api/bookings/tickets/mine`.
- Expected: The new booking appears; another visitor's `GET /mine` never includes it.
- Failure: Cross-visitor leakage, or the new booking missing.

---

## 14. QR generation

**14.1 — QR image encodes only the opaque token**
- Action: `GET /api/bookings/tickets/:id/qr` as the ticket's owner.
- Expected: `200 { qrCode, qrImage }`; `qrCode` is the booking's UUID token; decoding `qrImage` (any QR reader) yields exactly that token, no PII embedded.
- Failure: QR payload contains attendee name/email, or `qrCode` is guessable/sequential.

**14.2 — QR endpoint is owner-scoped**
- Action: `GET /api/bookings/tickets/:id/qr` using a different visitor's token for someone else's booking id.
- Expected: `404`.
- Failure: `200` — any authenticated visitor could pull anyone's QR.

---

## 15. QR validation

**15.1 — Scanner lookup is tenant-scoped**
- Action: `GET /api/bookings/tickets/lookup/:qrCode` as `org1.scanner@eventpass.test` for a real seed ticket's `qrCode`, then as a scanner belonging to a *different* organizer.
- Expected: Same organizer's scanner → `200` with booking details. Different organizer's scanner → `404`.
- Failure: Cross-organizer lookup succeeds.

**15.2 — Unknown QR code**
- Action: Lookup a random/nonexistent `qrCode`.
- Expected: `404`.
- Failure: `500`, or leaks whether *some* booking exists elsewhere.

---

## 16. Check-in

**16.1 — First check-in succeeds**
- Preconditions: A paid, not-yet-checked-in ticket (e.g. seed ticket 03, VIP, unused).
- Action: `PATCH /api/bookings/tickets/seed-ticket-03/check-in` as `org1.scanner@eventpass.test`.
- Expected: `200`; `checkInStatus: true`; a new `CheckIn` row (`method: "qr"`, `isOverride: false`).
- Failure: Succeeds against an unpaid ticket, or no `CheckIn` row is written.

**16.2 — Duplicate check-in without force is rejected**
- Action: Repeat 16.1 on the same booking without `{force: true}`.
- Expected: `409 { error: "This ticket has already been checked in", lastCheckIn }`.
- Failure: `200` — silently allows re-entry.

**16.3 — Override re-entry requires `checkin:override`**
- Action: `PATCH .../check-in` with `{force: true}` as `org1.scanner@eventpass.test` (scanner role — no override permission), then as `org1.owner@eventpass.test`.
- Expected: Scanner → `403`. Owner → `200`, new `CheckIn` row with `isOverride: true`.
- Failure: Scanner succeeds at forcing re-entry.

**16.4 — Concurrent double-scan** — see §25.3 (bonus concurrency case beyond A/B, same pattern).

---

## 17. Offline scanner

**17.1 — Queued check-in syncs once online**
- Preconditions: Frontend scanner UI, seed scanner account.
- Action: Simulate offline (devtools "Offline"), scan a paid unused ticket (queues locally via `useOfflineSync`), go back online.
- Expected: Toast confirms sync; server shows the `CheckIn` row; `localStorage` queue drains to empty.
- Failure: Item never syncs, or duplicates on reconnect.

**17.2 — Queued check-in for an already-checked-in ticket doesn't retry forever**
- Preconditions: Queue a check-in offline for a ticket, then have it get checked in from a *different* device/session while still offline.
- Action: Reconnect.
- Expected: Sync treats the resulting `409` as success (per `use-offline-sync.ts`'s explicit 409-is-not-a-failure handling), item is dropped from the queue, toast shows "already recorded".
- Failure: Item retries indefinitely / exceeds retry count and is discarded with an error instead of being recognized as already-applied.

---

## 18. Leads

**18.1 — QR-scan capture denormalizes visitor data**
- Action: `POST /api/leads` (capture) referencing a real `ticketBookingId` (e.g. seed ticket 02) as `biz1.staff@eventpass.test`.
- Expected: `201`; `visitorName`/`visitorEmail`/`visitorPhone` copied from the booking's attendee fields; `source: "qr_scan"`.
- Failure: Fields blank, or capture succeeds for a `ticketBookingId` belonging to an exhibition this business isn't participating in.

**18.2 — Manual capture works without a ticket**
- Action: `POST /api/leads` with denormalized `visitorName`/`visitorEmail`/`visitorPhone` and no `ticketBookingId`, `source: "manual"`.
- Expected: `201`.
- Failure: Rejected for lacking a ticket link.

**18.3 — Cross-tenant lead access is denied**
- Action: `GET /api/leads/seed-lead-new` (belongs to Biz1) as `biz2.owner@eventpass.test`.
- Expected: `404`.
- Failure: `200` — cross-exhibitor lead leak.

**18.4 — Export requires `lead:export`, not just `lead:view`**
- Action: `GET /api/leads/export` as `biz1.staff@eventpass.test` (staff — has `lead:view` but not `lead:export` per `permissions.ts`).
- Expected: `403`.
- Failure: `200` — staff can bulk-export leads.

---

## 19. Lead assignment

**19.1 — Assignment updates and audits**
- Action: `PATCH /api/leads/seed-lead-new` with `{assignedToUserId: "seed-user-biz1-admin"}` as `biz1.owner@eventpass.test`.
- Expected: `200`; lead's `assignedToUserId` updates; a new `AuditLog` row with `action: "lead.assigned"`.
- Failure: Update succeeds but no audit row appears.

**19.2 — Status transition audits with from/to**
- Action: `PATCH /api/leads/seed-lead-contacted` with `{status: "interested"}`.
- Expected: `200`; `AuditLog` row `action: "lead.status_changed"`, `metadata: {from: "contacted", to: "interested"}`.
- Failure: Metadata missing or wrong.

---

## 20. Audit logging

**20.1 — Organizer suspend/activate is audited**
- Action: `PATCH /api/platform/organizers/seed-organizer-1/suspend` with `{suspended: true, reason: "Integration test"}` as the platform admin, then `{suspended: false}`.
- Expected: Two `AuditLog` rows (`platform.organizer_suspended`, then `platform.organizer_activated`), each with `entityId: "seed-organizer-1"`.
- Failure: Suspend/activate succeeds but no audit trail.
- **Cleanup**: re-run with `{suspended: false}` at the end so you don't leave Organizer 1 suspended for later tests.

**20.2 — Audit log write failure doesn't break the underlying action**
- This is a code-reading check, not a live one: confirm `logAudit()` in `server/src/lib/audit.ts` catches its own errors — a broken audit write should never roll back or fail the caller's real action.

---

## 21. Analytics

**21.1 — Organizer dashboard respects role-based field visibility**
- Action: `GET /api/organizer/analytics/dashboard` as `org1.marketing@eventpass.test` (no `payment:view`) vs `org1.finance@eventpass.test` (has `payment:view`, no `lead:analytics`) vs `org1.owner@eventpass.test` (both).
- Expected: Marketing's response omits revenue figures; finance's omits lead figures; owner's has both.
- Failure: A role sees data its permission matrix shouldn't grant.

**21.2 — Exhibition analytics with an empty-data exhibition doesn't crash**
- Preconditions: Create (or use) a freshly-created exhibition with zero bookings.
- Action: `GET /api/organizer/analytics/exhibitions/:id`.
- Expected: `200` with zeroed/empty metrics, not a division-by-zero error or `500` from the raw `$queryRaw` date-bucketing.
- Failure: `500` — this is exactly the kind of thing static review can't catch.

**21.3 — Date-range filtering**
- Action: `GET /api/organizer/analytics/dashboard?from=2026-11-01&to=2026-11-30`, then with an invalid date `from=not-a-date`.
- Expected: Valid range → filtered metrics. Invalid date → `400` (per the `dateString` validator), not a crash.
- Failure: Invalid date causes a hang/500.

---

## 22. Platform Admin

**22.1 — Non-admin is denied**
- Action: `GET /api/platform/dashboard` as `org1.owner@eventpass.test`.
- Expected: `403`/`404` (per `requirePlatformAdmin`).
- Failure: `200` for a non-platform-admin user.

**22.2 — Suspending an organizer cuts off its members**
- Action: Suspend `seed-organizer-1` (as in 20.1), then `GET /api/organizer-members/` as `org1.owner@eventpass.test`.
- Expected: Owner's organizer-scoped calls now behave as if they have no access (`organizerIdsWithPermission` filters out suspended organizers) — e.g. `GET /api/exhibitions/seed-exhibition-1` returns `404` for them.
- Failure: Suspended organizer's members retain full access.
- **Cleanup**: unsuspend afterward.

**22.3 — Platform dashboard aggregates across all tenants**
- Action: `GET /api/platform/dashboard`.
- Expected: Counts reflect all 4 exhibitor businesses, the 1 organizer, all seeded tickets/payments — not scoped to any single tenant.
- Failure: Numbers match only a subset (scoping bug).

---

## 23. RBAC

**23.1 — Permission matrix spot-check per role**
- Action: For each `OrganizerMemberRole` and `ExhibitorMemberRole`, attempt one action that role should be able to do and one it shouldn't (cross-reference `server/src/lib/permissions.ts`'s `ROLE_PERMISSIONS`).
- Expected: Exactly matches the matrix — e.g. `scanner` can `PATCH .../check-in` but not `PUT /api/exhibitions/:id`; `finance` can view payments but not manage members.
- Failure: Any mismatch between the matrix and actual enforcement.

**23.2 — Membership-but-wrong-role never bootstraps a second tenant**
- Preconditions: `org1.scanner@eventpass.test` (has a membership, wrong role for creation).
- Action: `POST /api/exhibitions` as that user.
- Expected: `403` — never a second organizer silently created for them.
- Failure: A new organizer is bootstrapped despite the existing (insufficient-role) membership.

---

## 24. Cross-tenant isolation

**24.1 — Organizer A cannot see Organizer B's exhibitions/bookings/payments**
- Preconditions: A second organizer tenant (bootstrap one via 4.3).
- Action: As Organizer B's owner, attempt `GET /api/exhibitions/seed-exhibition-1`, `GET /api/bookings/tickets?exhibitionId=seed-exhibition-1`, `GET /api/organizer/payments`.
- Expected: All `404` or empty — never Organizer A's data.
- Failure: Any leak of Organizer 1's data to Organizer B.

**24.2 — Exhibitor Business A cannot see Business B's leads/documents**
- Action: As `biz2.owner@eventpass.test`, attempt `GET /api/leads/seed-lead-new` (Biz1's lead) and `GET /api/documents` scoped check.
- Expected: `404` / empty list — never Biz1's data.
- Failure: Cross-business leak.

---

## 25. Concurrency

### A. Two simultaneous requests claiming the same stall

- Preconditions: An `approved` exhibitor participation (promote Biz3 from `applied` to `approved` via the organizer approval flow, or create a fresh one) with no stall yet, and a target `available` stall (e.g. seed stall `A-02`).
- Action: Fire two `POST /api/exhibitor/participations/:id/stall` requests **simultaneously** (same participation, same `stallId`, e.g. via two parallel `curl` processes backgrounded together) — or from two different participations racing for the *same* stall.
- Expected: **Exactly one** request returns `200` with the stall now `reserved`/linked to that participation. The other returns `409 { error: "That stall was just taken by someone else. Please pick another." }`. No `500`, no double-allocation.
- Failure: Both succeed (double-booked stall), or one throws an unhandled `500`.
- Implementation reference: `server/src/routes/exhibitorParticipations.ts` `POST /:id/stall` — conditional `updateMany` inside `$transaction`, guarded by `status: "available"`.

### B. Two simultaneous requests creating the same exhibitor participation

- Preconditions: An exhibitor user/business with **no** existing participation for `seed-exhibition-1` (e.g. a freshly-signed-up exhibitor account).
- Action: Fire two `POST /api/exhibitor/participations` requests **simultaneously** with the same `{exhibitionId: "seed-exhibition-1"}`, same bearer token (same business).
- Expected: **Exactly one** `exhibition_exhibitors` row exists afterward. One request returns `201`. The other returns a clean `409 { error: "You have already applied to this exhibition" }` — never a `500`, never a hang.
- Failure: Two participation rows exist (constraint somehow bypassed — should be impossible), or the losing request returns `500`/times out.
- Implementation reference: `server/src/routes/exhibitorParticipations.ts` `POST /` — `create` wrapped in a `try/catch` for Prisma `P2002` on the `@@unique([exhibitionId, exhibitorBusinessId])` constraint (hardened in this phase). Also exercises `server/src/lib/exhibitorBusiness.ts`'s `resolveExhibitorBusinessId`, which has the identical race on `ExhibitorBusiness.ownerId` for a truly brand-new user — hardened the same way.
- **How to actually fire this concurrently** (no test framework in this repo — see note below): two backgrounded `curl` processes started back-to-back and `wait`ed on, e.g.:
  ```bash
  curl -s -o r1.json -w "%{http_code}\n" -X POST http://localhost:4000/api/exhibitor/participations \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"exhibitionId":"seed-exhibition-1"}' &
  curl -s -o r2.json -w "%{http_code}\n" -X POST http://localhost:4000/api/exhibitor/participations \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"exhibitionId":"seed-exhibition-1"}' &
  wait
  cat r1.json r2.json
  ```
  This was run live during this phase — result: one `201`, one `409`, no crash.

### C. Two simultaneous check-ins on the same ticket (bonus, same pattern as A/B)

- Preconditions: A paid, not-yet-checked-in ticket.
- Action: Fire two `PATCH /api/bookings/tickets/:id/check-in` requests simultaneously.
- Expected: Exactly one `200`; the other `409 { error: "This ticket was just checked in by another scan" }`.
- Failure: Two `CheckIn` rows both treated as "the first" scan, or a `500`.
- Implementation reference: `server/src/routes/bookings.ts` `PATCH /tickets/:id/check-in` — conditional `updateMany` guarded by `checkInStatus: false` inside `$transaction`.

### D. Concurrent Organizer Bootstrap — ✅ FIXED in Phase 14B

**Fixed and verified live in Phase 14B.** Phase 14A identified this as a known open gap (organizer had no unique constraint analogous to `ExhibitorBusiness.ownerId`) and deliberately stopped short of inventing a schema change. Phase 14B added `Organizer.bootstrappedByUserId String? @unique` (migration `20260904070000_organizer_bootstrap_uniqueness`) — a narrow "at most one self-bootstrapped organizer per user" guard, not a general one-organizer-per-user rule; `OrganizerMembership` remains completely unrestricted and multi-organization membership is preserved (verified live — see the Phase 14B report). `resolveOrganizerId` now sets this field on create and catches `P2002` to resolve to the winning request's organizer.

- Preconditions: A fresh user with zero `OrganizerMembership` rows (e.g. a brand-new signup), Postgres running, server running.
- Action: Fire two genuinely concurrent `POST /api/exhibitions` requests (any valid body, e.g. `{"name": "..."}`) with the same bearer token — both go through `resolveOrganizerId` in `server/src/lib/organizer.ts` since the user has no existing membership yet.
  ```bash
  curl -s -o r1.json -w "%{http_code}\n" -X POST http://localhost:4000/api/exhibitions \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Race Exhibition A"}' &
  curl -s -o r2.json -w "%{http_code}\n" -X POST http://localhost:4000/api/exhibitions \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Race Exhibition B"}' &
  wait
  cat r1.json r2.json
  ```
- Expected: exactly one organizer is created; both requests resolve successfully and reference the same `organizerId`; no duplicate organizer; no crash; no hang; no uncontrolled `500`.
- **Actual behavior, reproduced live during Phase 14A (before the fix):** both requests returned `201`, but each created its **own** `Organizer` row and its own `owner` `OrganizerMembership` for the same user — two distinct `organizerId` values, confirmed via direct query.
- **Actual behavior, reproduced live during Phase 14B (after the fix):** both requests again returned `201`, but this time with the **identical** `organizerId` in both responses. DB query confirmed exactly 1 `Organizer` row and exactly 1 `owner` `OrganizerMembership` for the test user. Server log showed no error, no unhandled rejection. A follow-up sequential (non-racing) request from the same user also reused the same organizer, and the same user was then successfully invited into a second, unrelated organizer (`seed-organizer-1`) — confirming multi-organization membership still works normally. Test artifacts cleaned up afterward; verified zero leftover rows.
- Root cause (historical): `Organizer` had no field analogous to `ExhibitorBusiness.ownerId @unique`. The only related constraint, `OrganizerMembership @@unique([organizerId, userId])`, is a composite unique on the *pair* — it did nothing to stop two racing calls from generating two different `organizerId`s and inserting two rows that each satisfied that constraint independently.
- Fix implemented (Phase 14B): `Organizer.bootstrappedByUserId String? @unique` (migration `20260904070000_organizer_bootstrap_uniqueness`), populated only by `resolveOrganizerId`'s create call, never by the invite flow. `resolveOrganizerId` (`server/src/lib/organizer.ts`) now catches `P2002` on that constraint and resolves to the winning request's organizer instead of letting the error propagate.
- Failure modes that would indicate a regression: duplicate organizer, timeout/hang, process crash, a raw Prisma error surfacing to the client, or the loser's request resolving to the *wrong* organizer.

---

## Note on automated tests

This repository has **no test framework installed** (no Jest/Vitest/Mocha, no `test` script beyond the placeholder). Per the scope of these phases, a large testing ecosystem was deliberately **not** installed just to cover concurrency tests A–D — the manual `curl`-based procedures above are the documented substitute. All four (A, B, C, D) have now been executed live against the seeded database at least once (B and D twice — D once demonstrating the defect in Phase 14A, once confirming the fix in Phase 14B). If/when a test framework is added in a future phase, all four are natural first candidates for automation, being single deterministic HTTP-level races.
