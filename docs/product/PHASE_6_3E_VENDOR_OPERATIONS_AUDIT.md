# Phase 6.3E — Vendor Operations Integration Audit

## Scope
- Reuse the existing vendor service/profile foundation.
- Expose operational vendor information on public participant profiles.
- Expose only active vendor services.
- Keep private contact information out of the public contract.
- Preserve published/public Event, VENDORS module, participant status and visibility gates.

## Public contract
Allowed:
- service area
- operating hours
- public website
- active service name/category/description

Not exposed:
- contact name
- contact email
- contact phone
- archived/inactive services
- internal organizer-only operational fields

## Non-goals
- No vendor booking/payment system.
- No new vendor service schema.
- No changes to vendor CRUD ownership or RBAC.

## Verification target
Backend build/tests, frontend lint/build, Browser E2E, dependency/security audit and repository CI must all be green before merge.
