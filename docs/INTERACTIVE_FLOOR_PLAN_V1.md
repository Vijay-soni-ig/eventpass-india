# ExhibitTix — Interactive Floor Plan / Stall Map V1

Status: FP-01 started  
Branch: `feature/interactive-floor-plan`  
Base: `main` at `03d861771b95395dc283cb8d22ec66cf111a7223`  
Tracking issue: #27

## 1. Product objective

Provide organizers with a production-grade visual floor-plan editor and exhibitors with an interactive stall-selection experience while keeping the existing Stall, reservation, booking and payment architecture authoritative.

The floor plan is a **visual layer over commercial inventory**, not a replacement inventory system.

## 2. Non-negotiable architecture

```text
Event / Exhibition
  └── Venue / Hall
        └── Stall                ← commercial source of truth
              ├── availability
              ├── reservation
              ├── booking
              └── payment

FloorPlan
  └── FloorPlanObject            ← visual metadata only
        └── stallId → Stall.id   ← required business reference
```

A FloorPlanObject must never independently decide whether a stall is available, reserved, sold or bookable.

## 3. Existing implementation audit — confirmed on main

The repository already contains an initial floor-plan/editor implementation. It is **not** sufficient to declare the production feature complete.

### Existing UI

- `src/pages/organizer/exhibitions/workspace/FloorPlan.tsx`
  - Uploads a floor-plan image.
  - Reads `exhibition.stalls`.
  - Mounts `StallLayoutEditor`.
  - Creates, updates and deletes stalls through existing hooks.
- `src/components/exhibitor/StallLayoutEditor.tsx`
  - Local editor state.
  - Drag and resize.
  - Add/delete stalls.
  - Auto-arrange.
  - Local image preview.
  - Properties panel.

### Existing business surfaces that must remain authoritative

- `src/pages/organizer/stalls/Stalls.tsx`
- `src/pages/exhibitor/stalls/Stalls.tsx`
- `src/pages/StallBookingFlow.tsx`
- `server/src/routes/bookings.ts`
- `server/tests/phase26_8StallConcurrency.test.ts`
- `server/prisma/schema.prisma`

### Production concerns in current editor

The current editor mixes visual editing with Stall CRUD and contains frontend defaults such as fixed base prices, generated coordinates/sizes and local image state. These assumptions must not become the new production contract.

The production implementation must separate:

1. visual layout persistence;
2. Stall commercial data;
3. reservation/booking state;
4. published-map visibility.

## 4. V1 data contract

Recommended models:

### FloorPlan

- `id` — UUID primary key
- `hallId` — FK to Hall
- `name`
- `status` — draft / published / archived
- `version`
- `backgroundUrl` nullable
- `canvasWidth`
- `canvasHeight`
- `publishedAt` nullable
- `createdAt`
- `updatedAt`

Constraints/indexes:

- unique active floor plan per Hall/version policy
- index on `hallId, status`

### FloorPlanObject

- `id` — UUID primary key
- `floorPlanId` — FK to FloorPlan
- `stallId` — FK to existing Stall
- `x`
- `y`
- `width`
- `height`
- `rotation` default 0
- `zIndex` default 0
- `labelVisible` default true
- `createdAt`
- `updatedAt`

Constraints/indexes:

- unique `(floorPlanId, stallId)`
- index on `floorPlanId`
- index on `stallId`

The `stallId` relationship is the key invariant preventing a visual stall from becoming a second commercial inventory record.

## 5. Publish validation

A FloorPlan cannot publish unless:

- every FloorPlanObject references a real Stall in the same Hall;
- no Stall is mapped more than once in the same FloorPlan;
- no object has invalid/negative dimensions;
- objects are within the configured canvas bounds according to the chosen overflow policy;
- required stall fields are valid;
- the Hall belongs to the organizer making the request;
- the organizer has the required permission;
- the FloorPlan is internally consistent;
- stale/archived/deleted referenced records are rejected according to the final business rule.

Publish must be transactional.

## 6. Booking integration

The interactive exhibitor map must query current Stall availability from the existing backend contract.

Selection flow:

`Published map → select available Stall → server reservation → existing booking/payment → confirmation`

The client must never convert a visual selection into a confirmed booking by itself.

The existing concurrent-reservation invariant remains mandatory: when two exhibitors attempt the same Stall concurrently, exactly one wins and the other receives a conflict response.

## 7. RBAC / tenant isolation

Organizer-side actions must be scoped through the existing organizer access/permission system.

At minimum:

- view floor plan: permitted organizer members according to event access;
- edit layout: stall-management permission;
- publish: owner/admin or explicitly approved publishing permission;
- exhibitor selection: only for eligible exhibitors and published events;
- platform admins retain platform-level oversight without bypassing audit requirements.

Every object lookup must be tenant-scoped. Never authorize based only on an object ID supplied by the client.

## 8. Audit requirements

Audit at least:

- floor plan created;
- background changed;
- object added/mapped;
- object moved/resized/rotated;
- object removed/unmapped;
- draft saved;
- publish;
- unpublish/archive;
- validation failure where security/operationally meaningful.

Do not expose sensitive financial or personal data in audit metadata unnecessarily.

## 9. UX requirements

Organizer editor:

- clear Draft / Published state;
- zoom and pan;
- grid/snap support where useful;
- keyboard-accessible selection and property editing;
- visible unsaved-change state;
- undo/redo before broad rollout if editing complexity warrants it;
- validation summary before publish;
- confirmation for destructive removal;
- loading, empty, error and save-conflict states;
- responsive fallback for smaller screens.

Exhibitor map:

- legend for Available / Reserved / Sold / Unavailable;
- clear selected state;
- stall details panel;
- real-time-ish availability refresh before reservation;
- graceful conflict handling;
- accessible alternative list/table for users who cannot use the visual map;
- mobile-friendly interaction.

## 10. Security requirements

- server-side authorization on every mutation;
- Hall/Event/Organizer ownership checks;
- protection against IDOR/BOLA;
- strict input validation;
- coordinate/dimension limits to prevent abuse;
- upload validation and production object-storage rules for background images;
- rate limiting on high-cost map/reservation endpoints;
- no client-controlled price or availability authority;
- audit logging for privileged mutations.

## 11. Performance requirements

The editor must respect the existing frontend performance budget.

For large halls:

- avoid unnecessary React re-renders for every object during pointer movement;
- use transform-based movement where practical;
- consider virtualization/level-of-detail for very large maps;
- lazy-load editor-only dependencies;
- keep the public/exhibitor map payload bounded;
- avoid embedding large base64 images in persisted state.

## 12. Testing contract

Required before production acceptance:

### Unit
- coordinate normalization;
- bounds validation;
- object/stall mapping validation;
- publish validation.

### API/integration
- authorized organizer can edit;
- unauthorized member rejected;
- cross-organizer access rejected;
- duplicate stall mapping rejected;
- stale Stall rejected;
- publish transaction atomicity.

### Concurrency
- existing Stall reservation concurrency regression remains green;
- FloorPlan selection never bypasses reservation locking.

### UI/E2E
- create/open editor;
- add/map/move/resize;
- save and reload;
- validation failure;
- publish;
- exhibitor sees published map;
- sold/reserved states render correctly;
- select → reserve → booking/payment;
- reservation conflict is handled correctly.

### Accessibility
- keyboard navigation;
- focus visibility;
- accessible labels/roles;
- non-map alternative selection;
- reduced motion compatibility.

## 13. V1 acceptance criterion

The feature is complete only when the visual editor, persisted FloorPlan data, API authorization, publish validation, existing Stall inventory, reservation concurrency, booking/payment, accessibility, security and cross-persona E2E flow are all verified.

Until then, status remains **PARTIAL PASS / IN DEVELOPMENT**.
