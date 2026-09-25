# Phase 6.2 Audit — Specialized Participant Capabilities

Date: 2026-09-25
Status: Audit completed; first independent implementation in progress.

## Current state verified on main

Phase 6.1 is complete and merged through PR #221. The repository already has:
- Universal Event participant foundation via `EventParticipant`.
- Participant types: SPEAKER, SPONSOR, VENDOR, PARTNER, STAFF, CUSTOM.
- Generic participant CRUD with pagination, search, sorting, archive/restore and audit logging.
- Dedicated CRUD routes for speakers, sponsors, vendors, partners and staff.
- Module gating and organizer RBAC using `event:view` / `event:update`.
- STAFF privacy enforced at create/update and public-directory query level.
- Public participant directory with module isolation.
- Browser/backend regression coverage for module gates, RBAC, privacy and lifecycle.

001F is also merged. Event modules now include SPEAKERS, SESSIONS, SPONSORS, PARTNERS, VENDORS and PARTICIPANTS, with per-event enablement.

## Gaps against Phase 6.2 requirements

### Speakers
Current speaker records are still generic participant rows. They have basic profile fields, but no first-class session/schedule relationship and no session CRUD model.

### Sponsors
Current sponsor records are generic participant rows. There is no sponsorship tier/package, benefit, amount, deliverable or branding model.

### Vendors
Current vendor records are generic participant rows. There is no service/category catalog or operational/contact configuration.

### Partners
Current partner records are generic participant rows. There is no partner organization-specific profile/visibility metadata beyond generic fields.

### Staff
Current staff records correctly remain private, but there is no internal operational profile, assignment, department or availability structure.

### Shared media/profile
Photo URL is currently a single scalar field. There is no reusable participant media/profile-extension model.

### Public integration
The public participant directory exists, but specialized public presentation is still generic. Speakers need schedule/session context, while staff must remain excluded.

## Highest-value independent implementation

Implement the **Speaker + Session/Schedule foundation first**.

Reason:
1. It is the clearest missing relationship in the 6.2 requirements.
2. It unlocks the first meaningful specialized public experience: speaker profile + agenda/session context.
3. It introduces a reusable pattern for future sponsor/vendor/partner relationships without changing the Event root.
4. It is isolated from payment, ticketing, stall booking and floor-plan paths.
5. It can be fully verified with DB constraints, RBAC/module gates, CRUD, audit logging and public privacy tests.

## Scope for this implementation

- Add `EventSession` with event ownership, date/time, timezone, room, status and ordering.
- Add `EventSessionSpeaker` join model with role and ordering.
- Enforce that assigned participants are SPEAKER records belonging to the same Event.
- Add organizer session CRUD.
- Add public published-session read API.
- Public API exposes only active, public speakers.
- Keep STAFF and private participant fields out of the public payload.
- Add migration, API tests and audit events.

## Deliberately deferred

- Sponsor packages/tiers and benefits.
- Vendor services/categories/operations.
- Partner-specific organization profile.
- Staff operational assignment/privacy model.
- Shared participant media gallery.
- Full speaker social/profile extension beyond the existing generic profile fields.

Those should follow as separate bounded increments after the session foundation is verified.
