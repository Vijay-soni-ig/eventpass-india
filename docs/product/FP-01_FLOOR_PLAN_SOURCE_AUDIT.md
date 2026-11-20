# FP-01 Floor Plan Foundation — Source Audit

**Branch:** `feature/fp-01-production-floor-plan`
**Baseline:** `main` at `a22bb50db4ba99386dfc55ff17f1f8fb92a4d5b7`
**Audit date:** 2026-11-21

## Verified current architecture

- The organizer workspace already contains a hall-aware Floor Plan page (`src/pages/organizer/exhibitions/workspace/FloorPlan.tsx`) with hall selection, draft reuse, image upload, blank-canvas creation, editor/preview tabs, and published-plan preview.
- The organizer editor (`src/components/organizer/floorplan/FloorPlanEditor.tsx`) is a substantial existing implementation: draft selection, persisted plan detail loading, stall placement, object and element editing, mobile element list, undo/redo, alignment/distribution, zoom/grid, bulk operations, stall generation, and publish actions are present in the source.
- The backend route `server/src/routes/floorPlanLayout.ts` is already mounted at `/api/exhibitions` in `server/src/app.ts`. It has authenticated organizer access, permission-scoped exhibition lookup, Zod request validation, mutation rate limiting, versioned draft writes, transaction/row locking, hall management, stall/object and non-stall element operations, and audit logging.
- The existing commercial source of truth remains Exhibition/Stall and the established stall booking/reservation APIs. The floor-plan API references existing stall IDs and checks exhibition ownership. No separate booking inventory should be introduced.
- The publish helper `server/src/lib/floorPlanPublish.ts` uses a hall-scoped advisory lock plus a pre/post published-plan snapshot to reject concurrent publish races; it validates mapped stall references and bounds, and archives the prior published plan when a new plan is published.

## Initial architectural conclusion

FP-01 is **not a greenfield build**. The existing implementation already covers much of the requested editor, persistence, hall lifecycle, draft/publish behavior, and concurrency protections. The remaining work must be a gap-driven hardening pass, not a rewrite.

## Gaps requiring further verification before implementation

- Complete publish validation matrix: duplicate stall mapping across plans/halls, missing required stall mappings, stale/deleted/archived stall references, and duplicate stall-code behavior.
- Published-map exhibitor selection contract: verify the public/exhibitor map reads live availability and booking state from the existing source APIs and cannot reserve from map-only state.
- Tenant isolation for every hall/plan/object/element route and direct API access; permission combinations for organizer owner/team roles.
- Draft-write concurrency and version increment behavior for all object, element, bulk, and canvas mutations; verify every transaction checks the final conditional update count.
- Lifecycle compatibility and migration safety, including legacy floor-plan image fallback and multi-hall edge cases.
- UI/browser E2E evidence for editor persistence, publish validation, switching halls, published map selection, responsive/mobile interactions, and keyboard/accessibility.
- Performance under large plans (API payload, render, drag/resize, bulk update and selection), and image-upload/security controls.

## Guardrails

- Do not change Stall CRUD, stall booking, payment, reservation, or concurrency logic unless a reproducible FP-01 defect requires it.
- Do not create a second availability/booking source.
- Do not add AI import/detection to V1.
- No production-ready claim without exact-head CI, browser E2E, API/database/authorization evidence, and documented limitations.

## Execution status

This is the first audit checkpoint only. The source review is incomplete; no implementation change or test run is claimed in this document.
