# Phase 6.2 Vendor Specialization Audit

Date: 2026-09-25
Status: Implementation prepared for CI verification.

## Existing capability

The EventParticipant foundation already provided:
- VENDOR participant type.
- Organizer CRUD with RBAC and VENDORS module gating.
- Pagination, search, sorting, archive/restore and audit logging.
- Generic public participant visibility controls.

## Missing specialization

The generic vendor record did not model:
- Event-scoped vendor service/category catalog.
- Assignment of multiple services to a vendor.
- Vendor operational contact details separate from public profile fields.
- Service area and operating hours.
- Booking/operational notes.
- Specialized public vendor presentation.

## Bounded implementation

This increment adds:
- EventVendorService with ACTIVE/INACTIVE/ARCHIVED lifecycle.
- EventVendorProfile, one-to-one with a VENDOR participant.
- EventVendorProfileService many-to-many assignment.
- Organizer service CRUD with archive/restore and duplicate-name protection.
- Organizer vendor profile upsert with same-event active-service validation.
- Specialized public vendor directory exposing only safe fields.
- Module gating, tenant isolation, audit logging and regression tests.

## Security/privacy

- Service assignments must belong to the same event and be ACTIVE.
- Vendor profile mutation requires organizer event:update.
- Vendor reads require event:view.
- Archived vendors cannot edit profiles.
- Public API requires PUBLISHED/public/non-archived event and VENDORS module.
- Private contact email/phone are excluded from public output.
- Cross-organizer event access returns 404.

## Deferred

- Vendor contracts and documents.
- Vendor payments/invoicing.
- Stall/resource allocation.
- Lead attribution.
- Vendor analytics.
- File/media gallery.

Those remain separate increments to avoid coupling operational vendor specialization with financial or stall-booking flows.
