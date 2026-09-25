# Phase 6.2 — Staff Specialization Audit

## Existing capability
Staff participants already have organizer CRUD, archive/restore lifecycle, tenant isolation, PARTICIPANTS module gating, and mandatory private visibility.

## Gap
Generic staff rows did not capture event-operational context such as department, assignment area, availability/shift information, or operational notes.

## Bounded implementation
Added an event-scoped EventStaffProfile with department, assignment area, role description, availability status, availability note, shift start/end, operational notes, and display ordering.

Added organizer-only profile GET/PUT/PATCH/DELETE endpoints with RBAC, tenant isolation, module gating, validation, archive protection, and audit logging.

## Privacy
Staff remains non-public. No public staff directory was added. Operational notes and availability are organizer-controlled internal data.

## Deferred
- staff accounts/credentials and access provisioning
- task/shift scheduling engine
- attendance/time tracking
- messaging
- staff analytics
- document/media galleries
