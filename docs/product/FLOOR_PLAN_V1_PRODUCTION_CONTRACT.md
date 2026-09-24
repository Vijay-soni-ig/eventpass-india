# Interactive Floor Plan V1 Production Contract

Status: implementation contract for FP-01

## 1. Architecture invariant

The existing commercial inventory remains authoritative:

`Hall -> Stall -> availability/reservation/booking`

The floor plan is presentation and layout metadata. A visual floor-plan object MUST reference an existing `Stall` and MUST NOT create a second availability, pricing, reservation, payment, or booking record.

## 2. Lifecycle

Each floor plan follows an explicit lifecycle:

1. Draft: organizer can edit layout metadata.
2. Preview: organizer can inspect the draft without changing the published map.
3. Publish: server validates the complete layout and atomically promotes the draft to the published version.
4. Published: exhibitors and visitors read the same published representation.

Unpublished edits MUST NOT change what public/exhibitor consumers see.

## 3. Object contract

Every persisted visual object MUST have:

- `stallId` referencing an existing stall in the same exhibition/tenant.
- finite `x`, `y`, `width`, and `height` values.
- positive dimensions.
- a bounded rotation value.
- deterministic `zIndex` ordering.
- explicit label visibility state.

A visual object without a valid stall reference is invalid and MUST prevent publication.

## 4. Publish validation

The publish operation MUST reject a layout when any of the following is true:

- two visual objects map to the same stall;
- a visual object references a missing stall;
- a visual object references a stall outside the current exhibition/tenant;
- coordinates or dimensions are non-finite or outside the allowed canvas bounds;
- width or height is non-positive;
- required layout metadata is missing;
- the submitted version is stale relative to the currently persisted version.

Validation MUST execute server-side. Client validation is only an additional usability layer.

## 5. Concurrency

Publish is a state transition and MUST be concurrency-safe. Two organizers attempting to publish conflicting versions MUST NOT silently overwrite one another. The server MUST reject a stale version or otherwise serialize the publish transaction.

The existing stall reservation/concurrency path remains authoritative and MUST NOT be modified by floor-plan publication.

## 6. Authorization and tenant isolation

Every read/write operation MUST resolve the exhibition and tenant from authenticated server-side context. Client-supplied exhibition identifiers MUST NOT grant access to another tenant's floor plan.

Required authorization cases:

- organizer with floor-plan edit permission can create/update draft metadata;
- organizer without edit permission cannot mutate the layout;
- exhibitor/public consumers can read only the published representation allowed for that exhibition;
- cross-tenant stall IDs MUST be rejected;
- unpublished drafts MUST never be exposed through public endpoints.

## 7. Public read model

Public and exhibitor consumers MUST receive only the published layout plus the current authoritative stall state needed for selection/display. The read path MUST NOT expose organizer-only draft metadata or internal audit information.

Stall availability MUST continue to come from the existing stall/booking APIs rather than from floor-plan object state.

## 8. Accessibility and responsive behavior

The published map MUST provide a usable non-pointer path for stall discovery/selection, meaningful labels for mapped stalls, keyboard-accessible controls where interaction is offered, and readable focus states. Responsive rendering MUST preserve stall identity and selection behavior on mobile layouts.

## 9. Performance

The floor-plan read path SHOULD avoid N+1 stall lookups and SHOULD return one bounded representation suitable for the expected exhibition size. Large layouts SHOULD render progressively where practical, but correctness and stall identity take precedence over animation.

## 10. Required regression evidence

Before FP-01 can be closed, CI/E2E evidence MUST cover:

- organizer create/edit/save draft;
- organizer preview versus published state;
- publish validation failures;
- duplicate-stall mapping rejection;
- cross-tenant authorization rejection;
- stale/concurrent publish rejection;
- public published-map read;
- exhibitor selection against real stall availability;
- preservation of existing stall reservation concurrency;
- keyboard/mobile accessibility for the published map.

## 11. Production gate

FP-01 is not production-complete until the implementation, server-side validation, authorization, concurrency behavior, accessibility, performance, and cross-persona E2E evidence all pass. Documentation alone does not satisfy the exit criteria.
