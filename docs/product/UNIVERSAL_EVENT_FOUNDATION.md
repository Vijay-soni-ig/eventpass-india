# Universal Event Foundation — Architecture Analysis (ETX-EVENT-001)

Status: **Analysis only. No schema, API, or behavior changes.**
Branch: `feature/universal-event-foundation` (base: `main`)
Scope: repository-grounded inventory + migration plan for evolving ExhibitTix from
an exhibition-only platform to a universal event platform, without breaking the
production-critical Exhibition flows (payments, ticketing, stall booking, floor
plan, check-in, leads, refunds, analytics).

---

## 1. Current State

ExhibitTix today is a single-domain platform built entirely around one Prisma
model, `Exhibition` (`server/prisma/schema.prisma:359-398`), which is both:

- the **event/listing entity** (title, dates, venue, status, visibility, cover
  image, category) — universal concepts any event type would need, and
- the **exhibition-specific commercial root** — directly owning `TicketType`,
  `Stall`, `FloorPlan`, `ExhibitionExhibitor` (booth participation), and
  content blocks (`ExhibitionMedia/Schedule/FAQ/Highlight/Audience`).

There is no `eventType` field, no category/module abstraction, and no separate
"Event" concept anywhere in the schema, backend routes, or frontend types.
`Exhibition` is the tenant-scoping root for almost every other domain object:
payments and refunds are reached transitively through `TicketBooking` /
`StallBooking`, never directly.

Three subsystems are **already event-agnostic** and require no architectural
change to support new event types:

- **Notifications** — `Notification.entityType`/`entityId` are plain strings
  (`server/prisma/schema.prisma:184-202`); `NotificationType` values are
  already named `EVENT_PUBLISHED`, `EVENT_UPDATED`, `EVENT_DATE_CHANGED`,
  `EVENT_TICKETS_AVAILABLE` (not `EXHIBITION_*`). Only the literal string
  `"Exhibition"` passed as `entityType` (`server/src/routes/exhibitions.ts`)
  would need to become configurable per event type.
- **RBAC** — authorization never trusts a client-supplied `exhibitionId`
  directly. Every route resolves the caller's permitted `organizerId` set
  server-side (`server/src/lib/access.ts`) and filters
  `WHERE id = :id AND organizerId IN (:allowed)`. This pattern generalizes to
  any owning entity without a redesign.
- **Frontend naming has already partially drifted toward "Event"** —
  `src/components/exhibition/EventHero.tsx`, `EventHighlights.tsx`, etc., and
  the organizer workspace (`EventWorkspaceLayout.tsx`, `EventWorkspaceNav.tsx`)
  use "Event" naming today even though the underlying type, routes, and API
  paths are all "Exhibition". This is a naming inconsistency to reconcile, not
  new work to invent.

Everything else — the Prisma model, ~15 backend route files, ~90+ frontend
hook call sites, URL paths (`/exhibition/:id`, `/organizer/exhibitions/...`),
and 50 of 66 backend test files — is hard-coded to "Exhibition".

---

## 2. Target State

A universal `Event` root that:

- Carries the universal fields every event type needs (title, organizer,
  owner, dates, timezone, venue/location, status, visibility, cover image).
- Delegates type-specific behavior (stalls, floor plans, exhibitor booths,
  sessions/speakers, seating, etc.) to **modules**, activated per event via
  an explicit module-enablement mechanism (see §4), not via inheritance or
  a giant nullable-field table.
- Preserves the existing Exhibition experience byte-for-byte during and after
  migration — exhibitions become "events with the EXHIBITION module bundle
  enabled," not a special case bypassing the new model.
- Keeps exactly one source of truth for shared fields (title, dates, status)
  — never a duplicated `Event.title` alongside `Exhibition.name`.

---

## 3. Domain Model — Current Exhibition (verified against schema)

### Exhibition fields, classified

| Field | Type | Classification |
|---|---|---|
| `id` | String (uuid) | Universal |
| `ownerId` → `User` | FK, cascade | Universal (creator) |
| `organizerId` → `Organizer` | FK, cascade | Universal (tenant) |
| `name` | String | Universal (title) |
| `category` | String? | Universal |
| `description` | String? | Universal |
| `venue`, `city`, `latitude`, `longitude` | String?/Float? | Universal (location) |
| `startDate`, `endDate` | DateTime? @db.Date | Universal |
| `coverImageUrl` | String? | Universal |
| `status` | `ExhibitionStatus` (draft/live/paused/completed) | Universal (lifecycle) |
| `visibility` | `Visibility` (public/private) | Universal |
| `refundPolicy`, `terms` | String? | Universal (commerce policy text) |
| `createdAt`, `updatedAt` | DateTime | Universal |
| `floorPlanUrl` | String? | **Exhibition-specific** — legacy single-image floor plan, superseded by `FloorPlan`/`FloorPlanObject` |

No field is ambiguous enough to require a judgment call beyond `floorPlanUrl`,
which is legacy and already superseded.

### Relationship graph (verified)

Direct FK to `Exhibition` (`exhibitionId`, all `onDelete: Cascade` unless noted):
`SavedExhibition`, `ExhibitionMedia`, `ExhibitionSchedule`, `ExhibitionFAQ`,
`ExhibitionHighlight`, `ExhibitionAudience`, `ExhibitionExhibitor`,
`TicketType`, `Stall`, `FloorPlan`, `TicketBooking`, `StallBooking`.

Indirect (transitively scoped, no `exhibitionId` column):
`FloorPlanObject` (via `floorPlanId`/`stallId`), `CheckIn` (via
`ticketBookingId`), `Lead` (via `exhibitionExhibitorId`).

**Not** linked to Exhibition at all: `Payment`, `Refund`, `PaymentEvent` — the
financial core is already exhibition-agnostic, reached only through
`TicketBooking.paymentId` / `StallBooking.paymentId`. This is a significant
advantage for migration safety (see §6, §11).

Indexes on `Exhibition`: `@@index([ownerId])`, `@@index([organizerId])`,
`@@index([status, visibility])`. Table mapped via `@@map("exhibitions")`.

### Universal vs. exhibition-specific, summarized

- **Universal**: name/title, description, organizer, owner, status,
  visibility, startDate/endDate, venue/city/coordinates, coverImageUrl,
  category, refundPolicy/terms.
- **Exhibition-specific**: `floorPlanUrl` (legacy field), and the entire
  stall/floor-plan/exhibitor-participation relation graph (`Stall`,
  `FloorPlan`, `FloorPlanObject`, `ExhibitionExhibitor`, `TicketType`'s
  stall-adjacent usage). These map to the future `STALL_BOOKING` and
  `FLOOR_PLAN` and `EXHIBITORS` modules, not to the `Event` core.

---

## 4. Proposed Universal Event Architecture

### `Event` (future core table)

```
id, organizerId, ownerId, title, slug, description, eventType, categoryId,
status, visibility, startDate, endDate, timezone, venue, city, latitude,
longitude, coverImageUrl, refundPolicy, terms, createdAt, updatedAt, archivedAt
```

This is a direct, conservative supertype of the current `Exhibition` universal
field set, plus `slug` (needed for organizer public profile linking, absent
today — `Organizer.slug` exists but `Exhibition` has none), `eventType`
(discriminator), and `archivedAt` (soft lifecycle, doesn't exist today —
`ExhibitionStatus` has no terminal "archived" state distinct from `completed`).

### `EventCategory`

```
id, name, slug, description, parentCategoryId, active, sortOrder
```

Today `Exhibition.category` is a free-text `String?` with no backing table —
confirmed no `Category` model exists in the schema. Introducing `EventCategory`
as a real table (rather than continuing free text) is recommended for
consistent filtering/analytics across event types, but is **not required**
for Step 1 of the migration — it can land after the `Event` root exists,
as a purely additive change with `Exhibition.category` values backfilled.

### Module representation — recommendation

Evaluated options:

| Approach | Scalability | Querying | RBAC fit | Analytics | Feature flags | Maintainability |
|---|---|---|---|---|---|---|
| Enum on `Event` | Poor — one enum column can't represent "multiple modules active at once" (an exhibition needs STALL_BOOKING + FLOOR_PLAN + EXHIBITORS + TICKETING simultaneously) | Simple but wrong shape | Can't express per-module permission scoping | Can't slice by module combination | None — requires migration to add a value | Low — enum growth is a schema migration every time |
| Configuration JSON on `Event` | Good | Poor — can't index/join efficiently, can't enforce referential integrity | Weak — no queryable join for "which events have module X" | Poor — requires JSON extraction in every query | Good — easy to toggle | Medium — schema-less drift risk |
| `EventModule` enum + `EventModuleEnablement` join table | Good | Good — standard indexed join, `WHERE moduleType = 'STALL_BOOKING'` | Good — permissions can reference `(eventId, moduleType)` | Good — join-friendly for module adoption reporting | Good — enable/disable is a row insert/delete, no migration | Good — new module types are enum additions, not schema changes to `Event` |

**Recommendation: `EventModule` enum + `EventModuleEnablement` join table**
(`eventId`, `moduleType`, `enabledAt`, optional `config: Json?` for
per-module settings). This is the standard pattern for this kind of
plugin/feature-composition problem: it keeps `Event` itself free of an
ever-growing set of nullable module-specific columns, supports multiple
simultaneous modules per event (required — exhibitions use at least four:
TICKETING, EXHIBITORS, STALL_BOOKING, FLOOR_PLAN), is trivially queryable and
indexable, and lets future event types (e.g. a conference with SESSIONS +
SPEAKERS + SPONSORS, no STALL_BOOKING) opt into exactly the modules they need
without touching the `Event` schema.

Candidate `EventModule` values (from the ticket's list, mapped against what
already exists): `TICKETING` (→ `TicketType`/`TicketBooking`, exists),
`STALL_BOOKING` (→ `Stall`/`StallBooking`, exists), `FLOOR_PLAN` (→
`FloorPlan`/`FloorPlanObject`, exists), `EXHIBITORS` (→ `ExhibitionExhibitor`,
exists), `CHECK_IN` (→ `CheckIn`, exists, presently coupled to `TicketBooking`
not a standalone module flag), `LEADS` (→ `Lead`, exists), `REGISTRATION`,
`SPEAKERS`, `SESSIONS`, `SPONSORS`, `VENDORS`, `VOLUNTEERS`, `SEATING`
(none exist yet — future event types), `ANALYTICS` (cross-cutting, arguably
not a toggle but always-on metadata rather than a module).

### Notification and RBAC fit

Both already generalize cleanly (§1): `Notification.entityType` can hold
`"Event"` instead of `"Exhibition"` with no schema change, and
`access.ts`'s `organizerIdsWithPermission` pattern applies unchanged to any
table with an `organizerId` column.

---

## 5. Migration Strategy

### Strategies compared

**A. Rename `Exhibition` → `Event` directly.**
Fast, but conflates "renaming a table" with "generalizing a domain" — every
non-exhibition-specific consumer (Stall, FloorPlan, TicketType,
ExhibitionExhibitor, and their ~15 backend route files + ~90 frontend hook
call sites) still hard-references exhibition-only concepts, so this either
(a) drags stall/floor-plan/exhibitor fields onto a table now misleadingly
named `Event` for every future event type, or (b) requires simultaneously
splitting those out — an enormous, high-risk single change touching payments,
refunds, floor-plan concurrency logic (`floorPlanPublish.ts`'s raw-SQL
advisory lock keys off `exhibitionId`), and 50+ test files at once, with no
intermediate rollback point. **Rejected.**

**B. Create `Event` and migrate everything immediately.**
Same blast radius as A plus a second table during transition — no safety
benefit over A, all of the risk, none of the incrementality. **Rejected.**

**C. Create `Event` as the universal root; progressively migrate Exhibition
dependencies onto it (Exhibition becomes an extension/detail table hanging
off Event, then individual modules move over one at a time).** Bounded,
reversible steps; each step ships independently testable and rollback-able;
production data integrity preserved by never deleting `exhibitions` until
every dependent is re-pointed and verified. **Recommended.**

**D. Introduce an application-layer domain abstraction first (a service-layer
`EventLike` interface over the existing `Exhibition` table), defer any DB
change.** Lowest immediate risk, but defers the real problem — every new
event type still needs its own table or a growing set of nullable exhibition
columns until the DB catches up, and the abstraction itself becomes throwaway
work once the real `Event` table lands. Reasonable as a *first sub-step inside
C* (see §10), not as the end-state strategy on its own.

### Recommended strategy: C, sequenced as

1. **Add `Event` table + `EventCategory` + `EventModule`/`EventModuleEnablement`**,
   additive only, no existing table touched, no application code changed yet.
2. **Backfill**: for every existing `Exhibition` row, create one `Event` row
   with matching universal fields, set `eventType = 'EXHIBITION'`, enable the
   `TICKETING`, `STALL_BOOKING`, `FLOOR_PLAN`, `EXHIBITORS` modules, and store
   `Exhibition.eventId` (new nullable FK, added to the existing table) pointing
   back to the new row. `Exhibition` becomes the exhibition-specific
   *extension* of `Event`, not a duplicate.
3. **Dual-write window**: application code updates both `Exhibition` and
   `Event` on every create/update, with `Exhibition` remaining the read
   source of truth for existing routes (zero behavior change) while `Event`
   catches up and is validated against production traffic in shadow-read
   mode.
4. **Cut over reads** route-by-route from `Exhibition` to `Event` (+ join to
   `Exhibition` for exhibition-specific fields), starting with the
   lowest-risk, highest-value read paths (public discovery, organizer
   listing) before the financially sensitive ones (booking, payment,
   refund).
5. **Only after** every dependent model/route/test is confirmed reading from
   `Event`, consider whether `exhibitionId` columns get renamed to `eventId`
   in place (a mechanical, low-risk rename once nothing depends on the old
   name) — this is optional and can be deferred indefinitely without blocking
   new event types, since new event types simply won't populate the
   `Exhibition` extension table at all.

This is deliberately the *safest*, not the *fastest*, path: it accepts a
temporarily wider schema (`Event` + `Exhibition` both present) in exchange for
never having a moment where production Exhibition data integrity, payment
correctness, or the floor-plan concurrency invariant depends on an unproven
new code path.

---

## 6. Dual-Source-of-Truth Risk

The strategy in §5 explicitly creates a window (steps 2-4) where both
`Event.title`/`Event.startDate`/`Event.status` and
`Exhibition.name`/`Exhibition.startDate`/`Exhibition.status` exist
simultaneously — exactly the divergence risk called out in the task. This is
addressed by:

- **`Exhibition` remains the single writable source of truth for shared
  fields throughout the dual-write window.** `Event`'s copies are populated
  by application code immediately after (or in the same transaction as) each
  `Exhibition` write — never independently editable through any route. No UI
  or API surface writes to `Event`'s shared fields directly during this
  phase.
- **A single shared service function** (not per-route duplicated logic) should
  perform every `Exhibition` create/update and its paired `Event` sync, so
  there is exactly one code path that can drift, not fifteen. (Today there
  is no such shared service — inline zod schemas and Prisma calls are
  duplicated per route file, per the backend inventory in this analysis
  — so introducing this shared write path is itself a prerequisite piece of
  work, tracked as part of Step 1 in §10, not an afterthought.)
- **Read paths never merge the two independently** — once a route is cut over
  to `Event` (step 4), it reads *only* from `Event` (joined to `Exhibition`
  for extension fields), never falling back to `Exhibition`'s copy of a
  shared field. There is no code path that reads `Event.status` in one place
  and `Exhibition.status` in another for the same decision.
- **A periodic consistency check** (integration test, not production code)
  during the dual-write window asserts `Event.title = Exhibition.name`,
  `Event.startDate = Exhibition.startDate`, `Event.status =
  Exhibition.status` for every row, catching drift before it reaches step 5.

---

## 7. API Migration Strategy

Current surface (verified, `server/src/app.ts:115-131`):
`/api/exhibitions/*` is shared by three routers (`exhibitionsRouter`,
`exhibitionContentRouter`, `floorPlanLayoutRouter`); plus
`/api/saved-exhibitions/*`, `/api/public/exhibitions/*`,
`/api/organizer/analytics/exhibitions/:exhibitionId`,
`/api/platform/exhibitions/*`, and exhibition-scoped params inside
`/api/bookings`, `/api/exhibitor/participations`, `/api/leads`.

Evolution path toward `/api/events/*` without breaking existing consumers:

- **Introduce `/api/events/*` as new, additive routes** backed by the shared
  service layer from §6 — never remove or reshape `/api/exhibitions/*` in the
  same change. `/api/exhibitions/*` keeps working, unmodified, indefinitely.
- **`/api/exhibitions/*` becomes a thin compatibility layer** once `/api/events/*`
  exists: it can either keep its own implementation untouched (simplest, zero
  risk, some duplication) or internally delegate to the same service functions
  `/api/events/*` uses (less duplication, requires care that response shapes
  stay byte-for-byte identical — response-shape snapshot tests recommended
  before doing this).
- **No versioning scheme change needed** — this is purely additive; existing
  consumers (the current frontend) are not required to move to `/api/events/*`
  until the frontend migration (§8) is ready, and even then the old paths can
  remain live for any third-party integrations.
- **Authorization**: every new `/api/events/*` route must reuse the exact
  `organizerIdsWithPermission` + `WHERE organizerId IN (...)` double-check
  pattern from `server/src/lib/access.ts` (§9) — this is not automatic and
  must be verified per route, not assumed from the old route's safety.

---

## 8. Frontend Migration Strategy

The frontend inventory surfaced a favorable signal: **component naming under
`src/components/exhibition/` and the organizer workspace already uses "Event"
naming** (`EventHero.tsx`, `EventWorkspaceLayout.tsx`, etc.) while the
underlying `Exhibition` type and API calls remain exhibition-named — i.e. the
presentation layer is already halfway migrated in spirit, only the data layer
lags.

Recommended path:

- **No central API client to fix** — `src/lib/apiClient.ts` is a thin generic
  HTTP wrapper; every exhibition endpoint is a hardcoded path string inside
  ~15 hook files (`src/hooks/exhibitor/useExhibitions.ts`,
  `usePublicExhibitions.ts`, `useFloorPlanLayout.ts`,
  `usePlatformAdmin.ts`, etc.). This means the migration touchpoint is these
  hook files, not one shared module — each hook can be moved to call
  `/api/events/*` independently, in any order, without a "big bang" cutover.
- **Do not touch `src/types/exhibitor.ts`'s `Exhibition` interface in place.**
  Introduce a new `Event` type (universal fields) and keep `Exhibition`
  importing/extending it, mirroring the backend's Event+Exhibition-extension
  split, so components consuming `Exhibition` today keep compiling unchanged.
- **`components/dashboard/*` (confirmed nav-config-driven, not
  exhibition-specific) and `components/exhibitor/scanner/*`,
  `components/payments/PaymentGatewayDialog.tsx` need no change** — they are
  already event-agnostic shells; new event types reuse them for free.
- **`components/exhibition/*` and the floor-plan/stall-picker components
  remain exhibition-specific** and should stay that way — they render
  concepts (stalls, booths) that only exist for the EXHIBITORS/STALL_BOOKING
  modules, not universal Event concepts. A future conference-type event
  detail page would use a parallel, different component set, composed by
  which modules are enabled — not a generalized version of `EventHero.tsx`
  forced to also render stalls.
- **Routing**: keep `/exhibition/:id`, `/organizer/exhibitions/*` etc. working
  unchanged; introduce `/event/:id` (or a type-aware `/events/:id`) only once
  a second event type actually exists to route to — there is nothing to
  build here speculatively.
- **Notification UI needs no change** — `useNotifications.ts` and
  `Notifications.tsx` are confirmed to have zero `Exhibition` references
  already.

---

## 9. RBAC Strategy

Current boundaries (verified): Super Admin (`platformRole: super_admin`,
global bypass in `can()`), Organizer (role-based via
`OrganizerMembership.role` → `permissions.ts`'s `ROLE_PERMISSIONS`),
Organizer team members (`OrganizerMemberRole`: owner/admin/operations/
finance/marketing/scanner — same table, scoped rows), Exhibitor
(`ExhibitorMembership.role`: owner/admin/staff, a **separate tenant axis**,
never merged with the organizer axis), Visitor (implicit, unauthenticated or
authenticated-with-no-membership).

`requireOrganizerAccess` middleware (`server/src/middleware/auth.ts:45`) is
coarse — it only checks "does this user have any active organizer
membership at all"; the actual per-resource check happens in the route
handler via `access.ts`'s derived-ID-set pattern.

**How universal Events should inherit ownership/permissions**: unchanged.
`Event.organizerId`/`Event.ownerId` plug directly into the existing
`organizerIdsWithPermission` function — no new authorization primitive is
needed, because that function already operates on "does this organizerId
appear in the caller's permitted set," not on anything Exhibition-specific.
The `Permission` enum in `permissions.ts` will need new entries
(`event:create/update/delete/view` alongside or replacing
`exhibition:create/...`), which is additive.

**IDOR/BOLA risk explicitly identified**: the safety of the current system
depends entirely on every route re-deriving the caller's allowed organizerId
set server-side and filtering `WHERE id = :id AND organizerId IN (:allowed)`
— confirmed present in `exhibitions.ts`, `exhibitionContent.ts`,
`floorPlanLayout.ts`, `organizerAnalytics.ts`, `organizerLeads.ts`. **The risk
is not in the data model, it's in the migration execution**: any new
`/api/events/*` route written by copy-pasting a handler and doing a naive
`prisma.event.findUnique({ where: { id } })` instead of the
`findFirst({ where: { id, organizerId: { in: allowed } } })` pattern
reintroduces cross-tenant access immediately. This must be a mandatory
code-review checklist item for every new event route, and ideally enforced
via a shared query-builder helper (another argument for the shared service
layer in §6) rather than left to per-route discipline.

The separate exhibitor-participation axis
(`exhibitionIdsForConfirmedExhibitor`, used by the exhibitor-side scanner)
generalizes the same way once `ExhibitionExhibitor` is renamed/generalized to
an `EventParticipant`-style model in a later module-migration step — not
required for the `Event` root itself.

---

## 10. Notification Impact

The Notification Foundation (already built, per repo history) is confirmed
**already event-agnostic**: `Notification.entityType`/`entityId` are plain
strings, `NotificationType` values are already named `EVENT_PUBLISHED`,
`EVENT_UPDATED`, `EVENT_DATE_CHANGED`, `EVENT_TICKETS_AVAILABLE` (not
`EXHIBITION_*`), and `notificationDispatcher.ts`/`notificationTemplates.ts`
contain zero exhibition-specific logic — they operate purely on the generic
fields. The **only** place that currently binds a literal domain name is
`server/src/routes/exhibitions.ts`, which passes `entityType: "Exhibition"`
into `generateFollowerNotifications(...)` at several call sites.

What eventually needs to become event-agnostic (not touched in this step):
that literal string should become derived from the event's actual type (or
simply `"Event"` once the universal root exists) so a follower notification
for a future conference doesn't say `entityType: "Exhibition"`. This is a
one-line-per-call-site change once `Event` exists — no notification
architecture rework is implied or needed.

---

## 11. Database Migration Risks

Ranked by financial/operational sensitivity, as requested:

- **`Payment` / `Refund` / `PaymentEvent`** — confirmed **not** directly
  linked to `Exhibition` at all (no `exhibitionId` column on any of the
  three). They are reached only via `TicketBooking.paymentId` /
  `StallBooking.paymentId`. This is the single biggest risk-reducer for the
  whole migration: the payment/refund ledger is untouched by anything in §5
  unless/until `TicketBooking`/`StallBooking` themselves are repointed, which
  this analysis does not propose doing in the initial phase.
- **`TicketBooking`, `StallBooking`** — direct `exhibitionId` FK,
  `onDelete: Cascade`. These carry `paymentId` and are the financial
  linkage point. Any later step that repoints these to `eventId` must be
  done with the row locked/transactional and verified against the payment
  ledger's own `TicketBooking`/`StallBooking.paymentId` uniqueness
  constraints (`@unique` on `paymentId` on both) — not part of this step's
  scope, called out for the future step that would do it.
- **`Stall`** — direct `exhibitionId` FK; also carries `status`,
  `reservedAt`, and an optional FK to `ExhibitionExhibitor`. The stall
  reservation-expiry sweep (`server/src/lib/stallReservationExpiry.ts`) and
  the booking-race protections (`phase26_8StallConcurrency.test.ts`) both
  key off `exhibitionId` — any future rename must preserve the exact index
  `@@index([status, reservedAt])` and re-verify the concurrency tests, not
  just the schema.
- **`FloorPlan` / `FloorPlanObject`** — `FloorPlan.publishFloorPlan()`
  (`server/src/lib/floorPlanPublish.ts`) uses **raw SQL** (`$queryRaw`/
  `$executeRaw` against literal table names `"floor_plans"`, `"floor_plan_objects"`,
  `"stalls"`) plus a Postgres advisory lock keyed on the string
  `` `floor-plan-publish:${exhibitionId}` ``. This is the highest-precision
  risk in the entire schema: a table rename here is **not** a Prisma-only
  change — the raw SQL strings must be updated in lockstep with any schema
  rename, or the optimistic-concurrency invariant ("exactly one published
  plan per exhibition," recently hardened per git history) silently breaks.
  This function is explicitly out of scope for modification in this step.
- **`CheckIn`** — no direct exhibition FK (via `ticketBookingId`), lower
  direct risk, but any change to `TicketBooking`'s exhibition linkage
  cascades here.
- **`Lead`, `ExhibitionExhibitor`** — direct/near-direct FK; `Lead` cascades
  from `ExhibitionExhibitor`, which itself has a
  `@@unique([exhibitionId, exhibitorBusinessId])` constraint that any future
  rename must preserve exactly (duplicate-participation prevention).

General migration-ordering risks: 32 existing migrations, no prior attempt to
introduce an `Event` table (confirmed via migration-history grep) — this is
genuinely net-new. Any future migration adding `Event` + backfilling from
`Exhibition` should run as an additive migration (new tables/nullable columns
only) with the backfill as a **separate, idempotent, re-runnable data
migration script**, not baked into the schema migration itself, so it can be
re-run safely if it fails partway on production data. Rollback for this
step is trivial (drop the new additive tables/columns, since nothing reads
from them yet); rollback gets progressively harder starting at §5 step 4
(read cutover) and should not be attempted past that point without a
tested down-migration.

---

## 12. Testing Impact

50 of 66 backend test files (`server/tests/*.test.ts`) directly reference
`exhibitionId`/`Exhibition`/`/api/exhibitions` (confirmed via grep). No
frontend or E2E test suite exists in the repo today (no Cypress/Playwright
config, no `*.test.tsx` files found) — all automated coverage is backend
integration tests run via Node's built-in test runner
(`tsx --test ... --test-concurrency=1`, serialized due to shared DB state).

| Area | Existing tests | Future change | Risk |
|---|---|---|---|
| Auth/RBAC | `pr01AuthorizationBoundaries`, `phase26_7RbacMatrix`, `phase26_6AuthSessionHardening` | New `event:*` permissions added alongside `exhibition:*`; new `/api/events/*` routes need the same authorization tests duplicated | High if new routes skip the derived-ID-set pattern (§9) |
| Exhibition CRUD/content/discovery | `exhibitionContent`, `phase235EventPublishing`, `phase232EventDetailHardening`, `phase22dDiscovery`, `phase22cConsolidation`, `phase233SavedExhibitions`, `phase24EventDetailExhibitors`, `nearbySearch`, `platformAdminCrud` | Must keep passing unmodified against `/api/exhibitions/*` throughout; new parallel tests needed for `/api/events/*` | Medium — regression risk is "did the compatibility layer change response shape" |
| Ticketing | `phase21bBookingIdempotency`, `phase21cStockAndUpload`, `phase234BookingIntentHardening`, `phase23fFunnelHardening`, `ui04TicketOwnership`, `entitlementVisitorStall` | Unaffected until `TicketBooking` is repointed (future step, out of scope here) | Low for this step |
| Payments | `phase21bPaymentRetry`, `phase26_1PaymentHardening`, `phase26_4WebhookVerification`, `pricingEngine`, `pricingVersionImmutability`, `sharedEngineIntegration` | None — Payment has no Exhibition FK | Low |
| Stall booking | `phase26_8StallConcurrency`, `phase30_reservationExpiry`, `phase21cExhibitorStallsAndKpi`, `entitlementExhibitor` | Unaffected until Stall is repointed | Low for this step |
| Floor plan | `phase27_floorPlanFoundation`, `phase28_floorPlanRegressions`, `phase29_floorPlanBookingIntegration`, `phase29_floorPlanPublishConcurrency` | **None planned in this step** — but this is the file to re-run first and most often once any future step touches `exhibitionId` at the DB level, because of the raw-SQL advisory-lock coupling (§11) | High risk for any *future* step, zero risk for this analysis-only step |
| Check-in | `phase21bExhibitorScanner` | Unaffected | Low |
| Leads | `phase21cOrganizerVisitorsAndLeads` | Unaffected until `ExhibitionExhibitor` generalized | Low |
| Analytics | Covered inline in `phase21cExhibitorStallsAndKpi`; no standalone analytics suite found | `analyticsService.ts` (heaviest exhibition-referencing lib file, 99 hits) will need parallel Event-aware queries eventually | Medium — no dedicated test file today is itself a coverage gap worth flagging |
| Notifications | `notificationEventRegistry`, `notificationTemplates`, `phase22nNotifications`, `phase31_notificationDispatcher` | Only the literal `entityType: "Exhibition"` string changes eventually; suites already test the generic `entityType`/`entityId` path | Low |

**Coverage gaps identified** (not fixed in this step): no frontend component
tests, no E2E tests, and no standalone analytics test file exist at all — any
future step that touches analytics or the frontend event-detail rendering has
no existing regression net to lean on.

---

## 13. Explicit Non-Goals (this step)

- No Prisma schema change.
- No new migration.
- No rename of `Exhibition`, any field, or the `exhibitions` table.
- No new API routes.
- No frontend code change.
- No change to payment, ticketing, stall booking, floor plan, check-in, lead,
  refund, or analytics behavior.
- No implementation of `Event`, `EventCategory`, `EventModule`, or
  `EventModuleEnablement` — proposed only, not created.
- No start of ETX-EVENT-002 or any subsequent implementation ticket.

---

## 14. Recommended Next Implementation Step

A separate, explicitly-scoped ticket (not started here) should cover exactly
**§5 step 1**: add the additive `Event`, `EventCategory`, `EventModule` enum,
and `EventModuleEnablement` tables via a single new Prisma migration, with no
application code changes and no backfill yet. That step is safe to review and
ship independently because nothing reads or writes the new tables. The
backfill (§5 step 2) and shared-write-service introduction (§6) should be
their own follow-up ticket after that, given they are the first steps with
any production-data-shape implications.
