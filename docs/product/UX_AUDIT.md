# ExhibitTix UX-01 Product UX Audit

Status: In progress
Base: main
Scope: Current product UX, information architecture, persona journeys, Universal Event adoption, and Exhibition-module separation.

## 1. Audit objective

Establish the current UX baseline before visual redesign or workflow changes.

The audit must identify:
- information architecture problems
- duplicate or competing workflows
- Universal Event vs Exhibition-module leakage
- persona-specific navigation problems
- high-friction core journeys
- missing loading/empty/error/success states
- mobile and accessibility risks
- P0/P1/P2 UX priorities

## 2. Current product model

Primary personas:
- Super Admin
- Organizer
- Exhibitor
- Visitor

Core lifecycle:
Event -> Venue/Hall -> Exhibition modules where enabled -> participation/stall booking -> payment -> visitor registration -> ticket -> QR check-in -> lead capture -> analytics.

Universal Event is the canonical product direction. Exhibition-specific capabilities remain module-specific.

## 3. Verified current route architecture

### Public / Visitor
- /events
- /exhibitions (compatibility alias to EventDiscovery)
- /event/:id
- /event/:id/register
- /event/:id/tickets
- /event/:id/participants/:participantId
- /exhibition/:id (legacy/specialized detail)
- /book/:id
- /book-stall/:id
- /saved-events
- /my-tickets
- /my-tickets/:ticketId
- /my-tickets/event/:ticketId
- /account/settings

### Exhibitor
- /exhibitor-dashboard
- business/profile/bank/team
- participations and participation payments
- documents
- leads and lead capture
- exhibitions
- sales
- tickets
- stalls
- attendees
- scanner
- analytics
- settings

### Organizer
Universal Event:
- /organizer
- /organizer/events
- /organizer/events/new
- /organizer/events/:id
- /organizer/events/:id/edit
- /organizer/events/:id/participants
- /organizer/events/:id/tickets
- /organizer/venues

Exhibition workspace:
- /organizer/exhibitions
- /organizer/exhibitions/new
- /organizer/exhibitions/:id/overview
- /details
- /content
- /applications
- /floor-plan
- /participants
- /tickets
- /attendees

Additional organizer operations:
- exhibitors
- stalls
- registrations
- visitors
- tickets
- check-in
- leads
- lead analytics
- payments
- analytics
- event analytics
- team
- profile
- gallery
- marketing
- settings

### Super Admin / Platform
- dashboard
- organizers
- exhibitions
- event categories
- exhibitors
- visitors
- payments
- audit logs
- subscriptions
- reports
- support
- settings

## 4. Initial UX findings

### P0: Competing Organizer Event Models
The Organizer portal exposes both:
- Universal Event routes under /organizer/events/*
- Exhibition-specific routes under /organizer/exhibitions/*

This creates two apparent ways to manage an event. The UX needs one canonical event-management mental model, with Exhibition capabilities appearing as enabled modules rather than as a competing product area.

Risk:
- organizer confusion
- duplicate workflows
- inconsistent terminology
- future event types forced into Exhibition navigation
- increased support and training burden

Recommended direction:
Universal Event should become the primary organizer event workspace. Exhibition functionality should be surfaced contextually when the corresponding modules are enabled.

### P1: Public URL / terminology inconsistency
The canonical public listing is /events, while /exhibitions remains a compatibility URL. A separate /exhibition/:id route also exists.

The compatibility behavior is technically reasonable, but the UX/content layer must make "Event" the universal concept and reserve "Exhibition" for the relevant event type/module.

### P1: Organizer global navigation vs event-scoped navigation
Organizer routes contain global operations such as exhibitors, stalls, tickets, leads, payments and analytics while the Exhibition workspace also contains event-scoped versions of participants, tickets and attendees.

The audit must establish which functions are:
- global organizer-level views
- event-scoped views
- module-scoped views

The same business object should not appear to have two unrelated management homes.

### P1: Visitor terminology still contains Exhibition-first surfaces
The homepage and discovery implementation still uses Exhibition-oriented data/hooks/components and copy in multiple places even though /events is now the canonical Universal Event listing.

This needs a terminology and component audit, not just URL replacement.

### P1: Feature/module discoverability
Universal Event architecture supports modules, but the current route surface does not yet provide a clearly unified mental model of:
Event -> enabled modules -> configuration -> operations -> analytics.

The final UX should make module availability visible and predictable without exposing technical implementation details.

### P2: Compatibility routes
Legacy aliases should remain for SEO/bookmark compatibility where required, but should not create duplicate navigation entries or competing CTAs.

## 5. UX principles for redesign

1. Event is the universal product concept.
2. Exhibition is a specialized event type/module, not a competing root workflow.
3. Event-scoped actions belong inside the selected Event workspace.
4. Organizer-global operations remain outside the event workspace.
5. Navigation should be driven by enabled capabilities.
6. The UI must never imply access to a disabled module.
7. Visitor UX is mobile-first.
8. Financial, booking, and check-in flows require explicit state communication.
9. Every major screen needs loading, empty, error, success and permission states.
10. Preserve compatibility routes while removing legacy mental models from primary navigation.

## 6. Next audit work

1. Inventory actual navigation configuration for Organizer, Exhibitor and Platform.
2. Map each route to persona, scope and module.
3. Audit Universal Event overview/edit/participant/ticket flows.
4. Audit Exhibition workspace and classify each screen as universal, module-specific or legacy.
5. Audit public discovery/event detail/registration/ticket purchase.
6. Audit Exhibitor participation/stall/payment/lead workflows.
7. Audit QR check-in workflow.
8. Audit dashboards and analytics information hierarchy.
9. Audit responsive/mobile behavior.
10. Audit accessibility and interaction states.
11. Produce final P0/P1/P2 UX backlog.
12. Create target information architecture before visual redesign.

## 7. Definition of UX-01 completion

UX-01 is complete only when:
- every current route is classified
- every primary persona has a documented journey
- duplicate/competing workflows are identified
- Universal vs Exhibition boundaries are explicit
- navigation ownership is defined
- high-risk UX problems have priority and rationale
- target IA is ready for design-system and screen redesign work

