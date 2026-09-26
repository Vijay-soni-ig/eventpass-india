# Advanced Venue Management — AVM-01 Foundation Audit

Status: AUDIT COMPLETE
Branch: `avm-01-foundation-audit`
Base: `main`
Audited commit: `63d6b83937b80701bb3583a9aa1272151918a78e`

## 1. Objective

Establish the production architecture boundary for Advanced Venue Management before AVM-02 through AVM-12 implementation.

The audit covers the existing venue, exhibition, hall/stall, floor-plan, booking, Event, authorization, public-read, and concurrency architecture.

## 2. Executive finding

The existing platform has a strong exhibition floor-plan foundation, but the current physical venue model is flatter than the target Advanced Venue Management hierarchy.

Current operational model:

`Venue name on Exhibition -> Exhibition -> Stall -> FloorPlan -> FloorPlanObject -> StallBooking`

Universal event model:

`Organizer -> Event -> EventModule`

Important finding:

**There is currently no standalone Prisma `Venue` or `Hall` entity that owns the existing floor-plan/stall inventory.** Venue and city are currently stored as fields on `Exhibition` and mirrored to the canonical `Event`.

Therefore AVM must introduce a physical venue domain without prematurely moving stall booking ownership away from the Exhibition module.

## 3. Verified current architecture

### 3.1 Exhibition

Current `Exhibition` contains:

- ownerId
- organizerId
- name
- category
- description
- venue
- city
- latitude / longitude
- dates
- cover image
- status / visibility
- `eventId` one-to-one link to canonical Event
- TicketType
- Stall
- StallBooking
- ExhibitionExhibitor
- FloorPlan

The Exhibition remains the operational source for legacy exhibition inventory and booking.

### 3.2 Event

The universal `Event` model contains:

- organizerId
- ownerId
- title
- category
- eventType
- status
- visibility
- dates
- timezone
- venue
- city
- coordinates
- cover/SEO data
- module enablements
- event-native ticketing/registration/participants/etc.
- optional one-to-one Exhibition link

The Event is the canonical layer for universal event identity and lifecycle.

### 3.3 Stall

Current Stall is directly owned by Exhibition:

- exhibitionId
- code
- stallType
- size
- price
- status
- visual geometry: posX, posY, width, height
- exhibitor allocation
- reservedAt
- StallBooking relation
- FloorPlanObject relation
- EventLead relation

**Business authority:** Stall remains the source of truth for commercial inventory, pricing, availability, reservation, allocation, and booking.

### 3.4 FloorPlan

Current FloorPlan is directly owned by Exhibition:

- exhibitionId
- name
- status
- version
- backgroundUrl
- canvasWidth / canvasHeight
- publishedAt
- FloorPlanObject relations

FloorPlanObject contains:

- floorPlanId
- stallId
- x/y
- width/height
- rotation
- zIndex
- labelVisible

**Architecture invariant:** floor-plan objects are presentation/layout metadata and must not become a second booking or inventory system.

### 3.5 Stall booking

StallBooking is directly owned by:

- Stall
- Exhibition
- optional User
- optional ExhibitionExhibitor
- Payment

The existing booking path must remain intact during AVM migration.

## 4. Existing floor-plan production controls

The current implementation already includes meaningful safeguards:

- draft/published/archived floor-plan lifecycle
- server-side bounds validation
- stall ownership/exhibition validation
- optimistic version checking
- exhibition-scoped PostgreSQL advisory locking
- concurrent publish conflict detection
- previous published plan archival
- public-only published map read
- public floor-plan rate limiting
- organizer permission/tenant checks
- mobile editor parity
- accessible stall labels
- public floor-plan regression/security coverage

The existing `floorPlanPublish.ts` implementation must be treated as a protected dependency of AVM.

## 5. Existing public/read architecture

Public floor-plan reads use:

`GET /api/public/exhibitions/:id/floor-plan`

The route:

1. validates public Event/Exhibition visibility
2. releases expired stall reservations
3. loads the published floor plan
4. returns the published representation

The public API deliberately exposes current stall state rather than trusting visual layout state.

AVM must preserve this security and consistency boundary.

## 6. Existing authorization architecture

Organizer authorization uses organizer membership/permission resolution and tenant filtering.

Existing Exhibition management follows the pattern:

`authenticated user -> permission -> authorized organizer IDs -> exhibition query constrained by organizerId`

Cross-organizer floor-plan and booking isolation already has dedicated regression coverage.

AVM entities must use the same tenant boundary. A client-supplied venue/building/floor/room ID must never be sufficient to authorize access.

## 7. Current gaps

### P0

1. No standalone Venue entity.
2. No standalone Hall entity.
3. No physical venue hierarchy.
4. No venue availability model.
5. No maintenance-block model.
6. No generalized capacity-rule model.
7. No venue-to-event allocation model.
8. No generic conflict detection between venue availability and event allocation.

### P1

1. No Building/Floor hierarchy.
2. No Zone/Area hierarchy.
3. No Room/Space model.
4. No physical-space abstraction for future seating/facilities.
5. FloorPlan is Exhibition-owned rather than attached to a reusable physical venue space.
6. Existing Stall visual coordinates duplicate some layout geometry that must be carefully reconciled with FloorPlanObject.

### P2

1. No entrances/access-point model.
2. No facility/amenity model.
3. No parking model.
4. No seating model.
5. No public venue information layer.

### P3 / future

1. Indoor navigation.
2. Crowd/occupancy telemetry.
3. IoT integration.
4. Smart parking.
5. AI venue optimization.
6. 3D/AR maps.

## 8. Target architecture

The physical venue domain should become:

`Venue -> Building -> Floor -> Zone -> Space -> FloorPlan`

Where Space can represent:

- Hall
- Room
- Meeting room
- Auditorium
- Lounge
- Storage
- Other operational spaces

Supporting entities:

- VenueEntrance
- ParkingArea
- Facility
- CapacityRule
- VenueAvailabilityBlock
- VenueMaintenanceBlock
- VenueAllocation
- MapObject

The existing exhibition module remains operationally compatible:

`Exhibition -> Stall -> StallBooking`

and initially:

`Exhibition -> FloorPlan`

AVM should introduce adapters/mappings rather than perform a destructive ownership migration.

## 9. Critical ownership decision

### Physical truth

Venue domain owns:

- where a space physically exists
- hierarchy
- physical capacity
- facilities
- entrances
- availability
- maintenance
- reusable map structure

### Event truth

Event domain owns:

- which event uses the venue
- event-specific configuration
- event dates
- enabled modules
- event-specific capacity limits
- event-specific map presentation where needed

### Exhibition module truth

Exhibition domain initially remains authoritative for:

- stalls
- stall pricing
- stall availability
- stall reservation
- stall booking
- exhibitor participation
- legacy floor-plan/stall relationships

This separation prevents a Venue model from becoming a second booking database.

## 10. Migration strategy

Do not immediately change:

`Stall.exhibitionId`

or:

`FloorPlan.exhibitionId`

Do not replace the existing StallBooking ownership.

Instead introduce the venue domain additively.

Recommended transition:

### Stage A

Create reusable Venue records and hierarchy.

### Stage B

Associate Exhibition/Event with a Venue through a dedicated allocation/reference.

### Stage C

Allow FloorPlans to reference physical spaces while retaining Exhibition compatibility.

### Stage D

Progressively migrate reads to the new venue hierarchy.

### Stage E

Only after production evidence exists, evaluate whether Stall/FloorPlan ownership should move from Exhibition to VenueSpace/EventSpace.

No ownership rewrite is required for AVM MVP.

## 11. Recommended data model direction

The first new models should be approximately:

- Venue
- VenueBuilding
- VenueFloor
- VenueZone
- VenueSpace
- VenueCapacityRule
- VenueAvailabilityBlock
- VenueMaintenanceBlock
- VenueAllocation

Later:

- VenueEntrance
- VenueParkingArea
- VenueFacility
- VenueSeatingArea
- VenueMapObject

All major entities should include:

- id
- parent FK
- status
- createdAt
- updatedAt
- archivedAt where appropriate
- ownership/tenant boundary
- indexes for parent + status
- unique constraints scoped to the parent
- audit coverage for material changes

## 12. AVM implementation dependency graph

`AVM-01 Audit`
↓
`AVM-02 Venue / Buildings / Floors`
↓
`AVM-03 Zones / Spaces`
↓
`AVM-05 Capacity`
↓
`AVM-10 Availability / Maintenance`
↓
`AVM-04 Room management`
↓
`AVM-06 Entrances`
↓
`AVM-07 Parking`
↓
`AVM-08 Facilities`
↓
`AVM-09 Seating`
↓
`AVM-11 Interactive maps`
↓
`AVM-12 Integration / migration / production QA`

AVM-04 and AVM-03 may be combined if implementation evidence shows the models should share the same Space abstraction.

## 13. API direction

Future APIs should be venue-scoped and server-authorized.

Examples:

- GET/POST /api/venues
- GET/PATCH/DELETE /api/venues/:id
- GET/POST /api/venues/:id/buildings
- GET/PATCH/DELETE /api/buildings/:id
- GET/POST /api/buildings/:id/floors
- GET/POST /api/floors/:id/zones
- GET/POST /api/floors/:id/spaces
- GET/PATCH /api/spaces/:id/capacity
- GET/POST /api/venues/:id/availability
- GET/POST /api/venues/:id/maintenance
- GET/POST /api/events/:id/venue-allocation

Exact routes should be finalized during AVM-02 API design rather than implemented now.

## 14. Security requirements

Every venue API must enforce:

- authentication
- role permission
- organizer ownership/membership
- parent-child relationship validation
- archived entity restrictions
- IDOR/BOLA protection
- input validation
- rate limiting for mutation-heavy endpoints
- audit logging
- no client-authoritative capacity/availability decisions

Public APIs must expose only published/public-safe venue data.

## 15. Testing requirements

Every AVM phase must include:

- unit tests
- API tests
- Prisma/database tests
- RBAC tests
- tenant-isolation tests
- validation tests
- archive/restore tests where applicable
- conflict tests
- browser E2E for user-facing workflows
- regression against existing Exhibition floor-plan/stall/booking flows

Critical cross-domain E2E:

`Organizer -> Venue -> Building -> Floor -> Space -> Event Allocation -> Exhibition -> Floor Plan -> Stall -> Booking`

The existing:

`Exhibition -> FloorPlan -> Stall -> StallBooking`

path must continue to pass.

## 16. AVM-01 acceptance criteria

- [x] Current main branch identified.
- [x] Existing Exhibition/Event architecture reviewed.
- [x] Existing Stall/FloorPlan/FloorPlanObject models reviewed.
- [x] Existing StallBooking relationship reviewed.
- [x] Existing public floor-plan path reviewed.
- [x] Existing floor-plan publish/concurrency implementation reviewed.
- [x] Existing authorization/tenant isolation approach reviewed.
- [x] Current architecture gaps documented.
- [x] Target ownership boundaries documented.
- [x] Migration strategy documented.
- [x] AVM-02 through AVM-12 dependency direction documented.
- [ ] AVM-02 implementation.

## 17. AVM-01 conclusion

AVM should be implemented as an **additive physical venue domain**, not as a rewrite of Exhibition.

The most important invariant is:

**Venue describes reusable physical infrastructure. Event describes event usage. Exhibition remains the operational owner of existing stall inventory until a separately verified migration proves a safer ownership transition.**

This preserves the production floor-plan and stall-booking work already completed while giving ExhibitTix a scalable foundation for buildings, floors, zones, rooms, capacity, availability, maintenance, facilities, parking, seating, and advanced maps.
