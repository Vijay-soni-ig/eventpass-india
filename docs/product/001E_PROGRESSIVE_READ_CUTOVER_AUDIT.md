# 001E Progressive Read Cutover Audit

## Scope
Audit current `main` after PR #422 for remaining Exhibition-backed reads and classify them before changing production behavior.

## Classification

### Event-canonical and already migrated
- Public universal event listing/discovery reads use `Event` for identity, lifecycle, dates, venue, location, organizer and canonical counts.
- Public organizer event listing uses `Event`.
- Universal Event detail resolves the linked Exhibition only as a compatibility payload while Event remains authoritative for universal fields.
- Universal Event analytics uses `Event` and Event-owned registration, ticket, check-in and participant records.
- Event module configuration is Event-owned.

### Legitimate Exhibition-module operational reads
These should remain Exhibition-backed until their corresponding operational models have universal replacements:
- Stall and floor-plan management.
- Exhibition exhibitor participation.
- Exhibition-specific content such as gallery, schedule, FAQ and related content.
- Legacy Exhibition workspace operations.
- Public Exhibition floor plans and exhibitor directory.
- Exhibition-owned ticket types/bookings and other legacy operational flows.

### Compatibility reads that should not be removed yet
- Public Exhibition endpoints first resolve the canonical linked Event and use Event status/visibility for linked records, while preserving the legacy Exhibition response contract.
- Legacy homepage/discovery consumers still receive Exhibition-shaped data, but universal identity fields are projected from Event.
- Event lead capture still validates Exhibition participation/stall relationships because those operational entities remain Exhibition-scoped.
- Universal ticketing intentionally excludes linked Exhibition events because Exhibition ticketing remains on the legacy operational model. This is a compatibility boundary, not an accidental omission.

### Migration-required / next candidates
1. Legacy public Exhibition-shaped consumers that still require Exhibition-owned ticket catalog/detail payloads should be migrated only after their frontend contracts are converted to Universal Event contracts.
2. Exhibition ticketing/order/check-in read paths should remain untouched until the Event ticketing model fully covers Exhibition operational requirements and migration tests prove parity.
3. Lead/stall/exhibitor participation reads require a dedicated universal participation/stall model before they can be cut over safely.

## Key finding
The current code already contains substantial 001E progressive-cutover work. The remaining Exhibition reads are concentrated in operational domains rather than generic Event identity/lifecycle reads.

A broad replacement of `prisma.exhibition` reads would therefore be unsafe. It would break floor plans, stalls, exhibitor participation, legacy ticketing and lead validation.

## Recommended next implementation
Prioritize the public Event detail/card contract migration:
- Convert the remaining legacy Exhibition-shaped public consumer to consume `UniversalEventDetail`.
- Keep Exhibition-specific modules behind explicit module boundaries.
- Preserve the existing linked Exhibition ID only where a module-specific route actually needs it.
- Add API and browser regression coverage for both standalone Universal Events and linked Exhibition Events.

## Acceptance criteria
- No universal Event identity/lifecycle field is read from Exhibition.
- Standalone Universal Events never depend on an Exhibition relation.
- Linked Exhibition Events continue to render existing Exhibition operational features.
- Disabled modules remain inaccessible through direct APIs.
- Existing floor-plan, stall, exhibitor participation, ticketing and lead flows remain green.
- CI, Browser E2E and dependency audit pass before merge.
