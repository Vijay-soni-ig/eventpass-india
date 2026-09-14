# ExhibitTix — Interactive Floor Plan / Stall Map V1

Status: **FP-01 BLOCKED — architecture foundation gap identified**  
Branch: `feature/interactive-floor-plan`  
Base: `main` at `03d861771b95395dc283cb8d22ec66cf111a7223`  
Tracking issue: #27

## FP-01 conclusion

FP-01 source-level audit is complete.

**Conclusion: BLOCKED for the originally proposed Hall-based production architecture.**

The current production schema has `Exhibition` → `Stall`, but does not currently have the proposed `Venue`, `Hall`, `FloorPlan`, or `FloorPlanObject` models. The existing floor-plan UI stores visual coordinates directly on the commercial `Stall` record and uses an image URL on `Exhibition`.

This is a concrete architecture gap, not a reason to stop the project. The safe next step is to introduce the missing visual/layout layer without breaking the existing stall inventory, reservation, booking, payment, RBAC, or concurrency contracts.

## Verified current architecture

### Commercial inventory

`Exhibition` owns `Stall[]`. Stall currently contains commercial fields including price/status plus legacy visual fields `posX`, `posY`, `width`, and `height`, and a relation to `ExhibitionExhibitor`. fileciteturn17file0L2-L2

### Stall reservation

The exhibitor API requires an approved participation, scopes the requested stall to the same exhibition, conditionally changes only an `available` stall to `reserved`, and moves the participation to `stall_reserved`. Concurrent losers receive `409`. fileciteturn30file0L2-L2

### Stall payment

The existing flow creates a Payment/order, moves the participation to `payment_pending`, and does not trust frontend payment success. Verified checkout/webhook outcomes remain authoritative. Retry/stale-payment handling is already implemented. fileciteturn30file0L2-L2

### Concurrency contract

The existing regression test proves that two concurrent exhibitors selecting the same stall produce exactly one `200` and one `409`, with exactly one participation becoming `stall_reserved`. fileciteturn23file0L2-L2

### Existing Floor Plan UI

`FloorPlan.tsx` already exists. It uploads a floor-plan image and directly creates/updates/deletes commercial Stall records through existing hooks. fileciteturn26file0L2-L2 The hooks expose Stall CRUD endpoints and currently send layout fields as Stall data. fileciteturn25file0L2-L2

## FP-01 findings

| Area | Result | Finding |
|---|---|---|
| Exhibition → Stall | PASS | Existing commercial relationship is clear. |
| Hall model | BLOCKED | No production Hall model exists. |
| FloorPlan model | BLOCKED | No persisted FloorPlan entity exists. |
| FloorPlanObject model | BLOCKED | No separate visual-object entity exists. |
| Existing Stall CRUD | PASS | Organizer CRUD exists and is tenant-scoped through permission lookup. |
| Stall reservation | PASS | Server-side conditional claim protects against TOCTOU concurrency. |
| Stall payment | PASS | Existing payment architecture remains authoritative. |
| Concurrency regression | PASS | Existing one-winner/one-conflict test is present. |
| Existing editor | PARTIAL PASS | Functional starting point, but mixes visual layout with Stall CRUD. |
| RBAC / tenant isolation | PASS / carry forward | Existing access helpers are the correct authorization boundary. |
| New FloorPlan audit logging | NOT IMPLEMENTED | Must be added with visual persistence. |
| Publish lifecycle | NOT IMPLEMENTED | No FloorPlan draft/published entity exists. |
| Interactive exhibitor map | NOT IMPLEMENTED | Production V1 experience does not yet exist. |

## Architecture decision

Do **not** force a new Hall hierarchy into the current product merely to satisfy the original diagram. The current safe V1 architecture is:

```text
Exhibition
  └── Stall                    ← existing commercial source of truth
        ├── price
        ├── status
        ├── reservation
        ├── booking
        └── payment

Exhibition
  └── FloorPlan                ← new visual/publishing layer
        └── FloorPlanObject
              └── stallId → existing Stall.id
```

A future Venue/Hall hierarchy can be introduced as a separate domain expansion if the business requires multiple halls per exhibition. It should not be invented inside FP-02 solely to satisfy the architecture document.

## FP-02 implementation contract

Implement the missing visual persistence layer:

### FloorPlan

- `id` UUID PK
- `exhibitionId` FK → Exhibition
- `name`
- `status`: `draft | published | archived`
- `version`
- `backgroundUrl` nullable
- `canvasWidth`
- `canvasHeight`
- `publishedAt` nullable
- `createdAt`
- `updatedAt`
- index `(exhibitionId, status)`

### FloorPlanObject

- `id` UUID PK
- `floorPlanId` FK → FloorPlan
- `stallId` FK → existing Stall
- `x`, `y`, `width`, `height`
- `rotation` default 0
- `zIndex` default 0
- `labelVisible` default true
- `createdAt`, `updatedAt`
- unique `(floorPlanId, stallId)`
- indexes on `floorPlanId` and `stallId`

### Migration rule

Do **not** remove `Stall.posX/posY/width/height` in FP-02. Existing code may consume them. Introduce the new visual source first, migrate/dual-read safely, then remove legacy fields only after repository-wide usage and regression tests prove they are unused.

## Publish rules

Server-side validation must reject cross-exhibition Stall references, duplicate mappings, invalid dimensions, invalid canvas bounds, unauthorized publishing, cross-organizer access, and inconsistent/stale references. Publishing must be transactional and must never change Stall commercial status merely because a FloorPlan is published.

## Interactive exhibitor flow

`Published FloorPlan → current Stall state → select Stall → existing server reservation → existing booking/payment → confirmation`

The map must never decide price, ownership, availability, reservation success, payment success, or confirmation.

## FP-01 exit criteria

FP-01 is concluded as **BLOCKED**, with the blocker fully characterized and a safe implementation decision established:

**Build FloorPlan + FloorPlanObject against the existing Exhibition → Stall relationship first; defer Venue/Hall hierarchy to a later domain phase.**

No production implementation has been falsely marked complete.

## Next action

Proceed to **FP-02: FloorPlan persistence + API foundation** on `feature/interactive-floor-plan`, including DB migration, Prisma models, tenant-scoped API, validation, publish lifecycle foundation, audit logging, and regression tests before the editor is rewired.
