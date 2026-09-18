# ExhibitTix — Interactive Floor Plan / Stall Map V1

Status: **V1 implemented — organizer editor, publish lifecycle, exhibitor map, and reservation integration are all functional and covered by regression tests.**
Branch: `feature/interactive-floor-plan`
Tracking issue: #27

This document reflects the current state of the branch as of the concurrency-hardening work in commit `37df356`. It supersedes the earlier "FP-01 BLOCKED" snapshot below, which described the state of the repository *before* FP-02 introduced the `FloorPlan`/`FloorPlanObject` models — that gap has since been closed.

## Architecture (as built)

The FP-01 audit's architecture decision was implemented as proposed, without inventing a Venue/Hall hierarchy:

```text
Exhibition
  └── Stall                    ← commercial source of truth (unchanged)
        ├── price
        ├── status
        ├── reservation (reservedAt, 1h expiry)
        ├── booking
        └── payment

Exhibition
  └── FloorPlan                ← visual/publishing layer (FP-02+)
        └── FloorPlanObject
              └── stallId → existing Stall.id
```

`FloorPlan`/`FloorPlanObject` are presentation-only. They never hold price, ownership, or availability — those remain on `Stall`. Publishing a `FloorPlan` never mutates a `Stall` row.

## Database model

`server/prisma/schema.prisma`:

- `FloorPlan`: `id`, `exhibitionId` (FK, cascade delete), `name`, `status` (`draft|published|archived`), `version`, `backgroundUrl?`, `canvasWidth`, `canvasHeight`, `publishedAt?`, timestamps. Unique `(exhibitionId, name)`. Index `(exhibitionId, status)`.
- `FloorPlanObject`: `id`, `floorPlanId` (FK, cascade delete), `stallId` (FK → `Stall`, cascade delete), `x`/`y`/`width`/`height`, `rotation` (default 0), `zIndex` (default 0), `labelVisible` (default true), timestamps. Unique `(floorPlanId, stallId)` — a stall can only be mapped once per plan. Indexes on `floorPlanId` and `stallId`.
- **Cascade on stall deletion**: if a `Stall` is deleted, its `FloorPlanObject` rows are removed automatically by the FK — a floor plan can never reference a stall that no longer exists.
- **Single-published-plan invariant**: partial unique index `floor_plans_one_published_per_exhibition_idx ON floor_plans(exhibitionId) WHERE status = 'published'` (migration `20260916150000_floor_plan_single_published`) enforces at the database level that at most one plan per exhibition is published, as a backstop behind the application-level check.

Migrations: `20260912130000_floor_plan_foundation` (initial models), `20260916150000_floor_plan_single_published` (uniqueness invariant). `Stall.posX/posY/width/height` (legacy visual fields) have **not** been removed — no repository-wide audit has yet proven they're unused, so per the original migration rule they stay until that's done.

## API (`server/src/routes/floorPlanLayout.ts`, mounted under `requireAuth, requireOrganizerAccess`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/:exhibitionId/floor-plan-layouts` | List plans (any status) for an exhibition |
| GET | `/:exhibitionId/floor-plan-layouts/:floorPlanId` | Get one plan + its objects |
| POST | `/:exhibitionId/floor-plan-layouts` | Create a draft plan (rejects duplicate name) |
| PATCH | `/:exhibitionId/floor-plan-layouts/:floorPlanId` | Update plan metadata; draft-only; re-validates existing objects still fit a resized canvas |
| POST | `/:exhibitionId/floor-plan-layouts/:floorPlanId/objects` | Map a stall onto the plan (draft-only, bounds-checked, stall must belong to the same exhibition, no duplicate mapping) |
| PATCH | `/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/:objectId` | Update an object's geometry/zIndex/labelVisible/stallId (draft-only) |
| DELETE | `/:exhibitionId/floor-plan-layouts/:floorPlanId/objects/:objectId` | Remove an object (draft-only) |
| POST | `/:exhibitionId/floor-plan-layouts/:floorPlanId/publish` | Publish a draft (see Publish lifecycle below) |

Public/exhibitor read paths:

- `GET /api/exhibitions/:id/floor-plan` (`server/src/routes/public.ts`) — anonymous, published-plan-only, 404 if none published or the exhibition is private. Never includes buyer name/email.
- `GET /api/exhibitor/participations/:id/floor-plan` (`server/src/routes/exhibitorParticipations.ts`) — authenticated exhibitor's own view for their participation's exhibition, available at any participation lifecycle stage (not gated to `approved`), releases expired reservations before returning.

Tenant isolation: every route resolves the exhibition through `loadExhibition(exhibitionId, user, permission)`, which restricts to organizer IDs the caller actually has the given permission (`exhibition:view` for reads, `exhibition:update` for writes) on, and returns `404` (not `403`) on denial to avoid existence leaks. Covered by `phase28_floorPlanRegressions.test.ts`'s cross-organizer and scanner-role tests.

## Publish lifecycle

`draft → edit → validate → publish → published read → (republish supersedes) → archive`.

Publish (`server/src/lib/floorPlanPublish.ts`) validates: plan exists and is a draft, has ≥1 mapped object, every mapped stall still belongs to the exhibition, every object is within canvas bounds — then archives whichever plan was previously published (if any) and publishes the target plan, atomically.

**Concurrency**: two publish requests racing for the same exhibition are resolved deterministically via optimistic concurrency control — snapshot which plan (if any) is published, acquire a blocking exhibition-scoped Postgres advisory transaction lock (`pg_advisory_xact_lock`), re-read the snapshot; if it changed while waiting, the request is rejected with `409` ("Another floor plan was published concurrently"). If unchanged, the archive-and-publish proceeds normally — this is what allows a legitimate sequential republish (publish A, then later publish B) to keep working while a genuine concurrent double-publish always yields exactly one `200` and one `409`. The database unique index is a second, independent backstop for any path that bypasses the lock. No partial transaction state is possible — the whole operation runs inside one `prisma.$transaction`.

Every publish is audited (`floor_plan.published` event via `logAudit`).

## Organizer editor (`src/components/organizer/floorplan/FloorPlanEditor.tsx`)

- Loads the exhibition's floor plan(s) and lets the organizer create a draft, map existing `Stall` records onto it, drag/resize objects on a scaled canvas, nudge with arrow keys, rotate (numeric field), reorder stacking via **Bring to front / Send to back**, toggle **label visibility** per stall, delete an object, and publish.
- **Never creates a Stall.** `handleAddStall` only sends `{ stallId, x, y, width, height }` referencing an existing commercial stall — the floor plan is strictly a visual layer over the existing inventory, never a second booking system.
- Editing is disabled once a plan is published (`canEdit && isDraft` gating throughout).
- A "Preview" tab reuses the read-only public component so organizers can see exactly what's published, with a banner when there are unpublished draft edits.
- Mobile: falls back to a list-form view instead of the drag canvas (no bring-to-front/send-to-back/label-toggle controls in the mobile list yet — see Known limitations).
- The legacy image-upload floor plan path (`Exhibition.floorPlanUrl`, in the same workspace page) still exists alongside the new editor, per the original migration rule that legacy fields/paths are only removed once proven unused repository-wide.

## Exhibitor-facing map

Two distinct read surfaces, intentionally not merged (different actions):

- **`src/components/PublishedFloorPlan.tsx`** — public/pre-application view (`ExhibitionDetail.tsx`). Selecting an available stall shows an "Apply to Exhibit" CTA — it starts the *application* flow, not a reservation, matching the apply → approve → select product design.
- **`src/components/exhibitor/FloorPlanStallPicker.tsx`** — the actual reservation picker, shown to an *approved* exhibitor in `MyParticipations.tsx`. Selecting a stall calls `useSelectStall()` → `POST /api/exhibitor/participations/:id/stall`, the same endpoint used by the non-map selection flow. No separate reservation logic exists in the floor-plan UI; the backend's conditional-update claim is the sole concurrency guard. Payment continues through the existing `POST /:id/payment` checkout flow, unchanged.
- Both components scale the canvas responsively via `ResizeObserver` and render real `<button>` stall tiles with `aria-label` (stall code/type/status/price) and `aria-pressed` for the selected state.

## Testing status

Backend (`server/tests`, run via `npm test` / `npx tsx --test --import ./tests/testSetup.ts --test-concurrency=1 tests/*.test.ts`):

- `phase27_floorPlanFoundation.test.ts` — CRUD + atomic publish, cross-exhibition stall rejection.
- `phase28_floorPlanRegressions.test.ts` — bounds validation, duplicate-mapping rejection, empty-plan publish rejection, sequential republish archiving the prior plan, draft-only edit enforcement, tenant isolation (404 not 403), public endpoint shape/visibility, scanner-role rejection.
- `phase29_floorPlanBookingIntegration.test.ts` — floor-plan view reflects real stall state after reservation/payment, concurrent reservation still yields exactly one winner, unapproved exhibitor can view but not reserve, cross-business access rejected, failed payment leaves stall reserved not available, paid stall shows sold.
- `phase29_floorPlanPublishConcurrency.test.ts` — concurrent publish yields exactly one `200` and one `409`, exactly one plan ends up published. (Races the publish function directly via `Promise.all`, not over HTTP — see the in-file comment: two `fetch()` calls do not reliably produce genuine server-side overlap due to connection/round-trip jitter, which made an earlier HTTP-based version of this test flaky independent of the underlying fix.)

All 20 floor-plan-specific tests pass as of this update, verified locally against a real Postgres 16 database (`npx tsx --test --import ./tests/testSetup.ts --test-concurrency=1 tests/phase27_floorPlanFoundation.test.ts tests/phase28_floorPlanRegressions.test.ts tests/phase29_floorPlanBookingIntegration.test.ts tests/phase29_floorPlanPublishConcurrency.test.ts`). Full backend suite (391 tests across the whole repo) verified separately with 2 pre-existing, unrelated failures caused by a Windows/git-bash test-file-glob-ordering quirk (`phase26_6AuthSessionHardening.test.ts`, `pr01SecurityHardening.test.ts` — both throw `JWT_SECRET is not set` when run without an earlier file having imported `dotenv/config` first); this reproduces identically on an unmodified `main` checkout and is not related to the floor-plan feature.

Frontend: `npx tsc --noEmit` (clean) and `npm run build` (clean, production build succeeds) verified. No dedicated frontend unit/component tests exist for the floor-plan editor or exhibitor map components — this project has no frontend test runner configured at all (Vitest/Jest/RTL are not present in `package.json`), so frontend behavior is verified via TypeScript, build, and manual/E2E-adjacent backend integration tests only.

**NOT TESTED**: full manual browser walkthrough of the organizer editor UI (drag/resize/rotate/z-index/label-toggle/publish) and the exhibitor map UI (select/reserve/pay) end-to-end in a running browser — this requires a live dev server session, which was not exercised as part of this pass. The underlying API contracts each UI calls are covered by the backend integration tests above.

## Known limitations

- Mobile editor view (`MobileObjectList`/`MobileObjectRow`) does not yet expose z-index reordering or label-visibility toggle controls (desktop canvas view does). Low-severity: these are non-critical secondary controls, and the underlying API already supports them from any client.
- `Stall.posX/posY/width/height` legacy fields still exist on the schema and are still read by the older grid-view fallback (`StallFloorPlan.tsx`, shown when no `FloorPlan` has been published yet, or via the "list view" toggle on `ExhibitionDetail.tsx`). This is intentional per the original migration rule, not an oversight.
- No dedicated E2E (browser-automation) test suite exists in this repository for any feature, floor plan included; "end-to-end" verification here means real HTTP integration tests against a real database, not a driven browser session.

## FP-01 → V1 history (superseded)

The sections below are preserved for history; they described the state of the repository **before** FP-02 closed the architecture gap they identify. They no longer reflect current status.

<details>
<summary>Original FP-01 audit (superseded)</summary>

Status at the time: **FP-01 BLOCKED — architecture foundation gap identified**

FP-01 source-level audit found that the production schema had `Exhibition` → `Stall` but no `FloorPlan`/`FloorPlanObject` models; the floor-plan UI stored visual coordinates directly on `Stall` and used an image URL on `Exhibition`. The architecture decision made at that time — build `FloorPlan` + `FloorPlanObject` against the existing `Exhibition` → `Stall` relationship, deferring any Venue/Hall hierarchy — is exactly what was implemented in FP-02 onward, and is documented as the current architecture above.

</details>
