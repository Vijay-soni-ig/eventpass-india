# ExhibitTix UX-02 Route & Navigation Map

Status: In progress
Base: main after UX-01 merge

## Objective
Map route ownership and scope before changing navigation.

## Canonical UX model

Platform
  -> Organizer
     -> Events
        -> Event workspace
           -> Core event
           -> Enabled modules
              -> Exhibition
              -> Ticketing
              -> Participants
              -> Check-in
              -> Leads
              -> Analytics
              -> other configured modules

Organizer-global operations:
- Event catalog
- Venues
- Organization/team
- Public profile
- Billing/payments where organizer-wide
- Cross-event analytics
- Cross-event leads where supported

Event-scoped operations:
- Event overview
- Event details/content
- Module configuration
- Participants
- Tickets
- Attendees/check-in
- Leads
- Floor plan/stalls when Exhibition/Floor Plan modules are enabled
- Event analytics

## Current conflict to resolve

Organizer sidebar currently exposes both:
- Events
- Exhibitions

while Universal Event pages also route exhibition-linked events back into the legacy Exhibition workspace.

This should be treated as migration/compatibility behavior, not the target UX.

## Current Exhibition workspace

Sections:
- Overview
- Details
- Content
- Applications
- Floor Plan
- Participants
- Tickets
- Attendees

The workspace is permission-aware and already uses contextual navigation, which is a useful pattern to preserve.

## Target navigation principle

Do not expose every event capability globally.

Instead:
1. Organizer opens Events.
2. Organizer selects an Event.
3. Event workspace shows only enabled modules.
4. Permissions further filter available actions.
5. Disabled modules are absent from primary navigation and rejected by API authorization.
6. Cross-event reporting remains organizer-global.

## UX-02 implementation scope

Before modifying production navigation:
- classify every Organizer route as global/event/module/legacy
- classify Exhibitor routes the same way
- classify Platform routes
- identify duplicate business-object entry points
- identify routes that are compatibility-only
- identify routes that must redirect to Universal Event
- define mobile navigation separately
- define breadcrumb hierarchy
- define event context indicator
- define module navigation pattern

## Acceptance criteria

- No ambiguous ownership for Event, Ticket, Participant, Lead, Visitor, Stall and Analytics screens.
- Universal Event is the canonical organizer entry point.
- Exhibition remains a capability/module where appropriate.
- Legacy URLs remain functional only where compatibility requires them.
- Mobile navigation has a deliberate information hierarchy.
- Permission filtering remains intact.
- API authorization remains authoritative regardless of UI navigation.
