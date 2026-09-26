# AVM-12B — Legacy Compatibility & Venue Integration Audit

Date: 2026-09-26

## Objective
Verify that Advanced Venue Management integrates with Universal Event without prematurely migrating Exhibition-owned commercial and operational domains.

## Event-canonical
- Event identity, lifecycle, visibility, dates, category
- Event modules
- Universal Event ticketing and registrations
- Event participants, speakers, sponsors, vendors, partners, staff
- Universal Event check-in and Event leads
- Event analytics
- Event -> physical Venue (Event.venueId / Event.physicalVenue)

## Exhibition compatibility / intentional legacy ownership
- Stall inventory, pricing, availability, reservations and bookings
- Exhibitor participation
- Exhibition ticket types and legacy ticket bookings
- Exhibition floor plans and stall geometry
- Exhibition-specific content/media/schedules/FAQs/highlights/audiences
- Legacy Exhibition lead and CheckIn models
- Exhibition payment/bookings

These should not be migrated merely for schema consistency. They require dedicated domain cutovers with payment, booking, concurrency and reporting regression coverage.

## Migration-required gap
The public Universal Event list/detail/ticket responses expose legacy Event.venue text but do not expose the canonical physical Venue relation. This prevents public consumers from using reusable Venue metadata when an Event has a physical Venue assigned.

## Security / tenancy
- Event -> Venue assignment is organizer-scoped.
- Archived/inactive Venues cannot be assigned through the Event integration path.
- Venue deletion uses ON DELETE SET NULL, preserving Event history.
- Existing Exhibition ownership boundaries remain intact.
- No direct Event authorization bypass was identified in the reviewed Event/Venue integration.

## AVM-12B decision
Implement only public-read Venue integration.
Do not migrate Stall -> Venue, StallBooking -> Venue/Event, FloorPlan -> VenueMap, Exhibition ticket booking -> Event ticketing, Legacy Lead -> EventLead, or Legacy CheckIn -> EventTicketCheckIn in this phase.

## Acceptance criteria
- Public Event list returns canonical physical Venue summary when assigned.
- Public Event detail returns canonical physical Venue summary when assigned.
- Public Event ticket catalog returns canonical physical Venue summary when assigned.
- Legacy venue text remains available for backward compatibility.
- Private/archived Venue data is not exposed publicly.
- Existing Exhibition public flows remain unchanged.
- CI, Browser E2E and Dependency Audit pass.