# Registration Foundation Readiness Audit

## Scope

This audit covers the universal Event registration lifecycle currently implemented in:

- `server/src/routes/registrations.ts`
- `server/src/routes/organizerRegistrations.ts`
- `EventRegistration`
- `EventRegistrationSettings`
- registration permissions/RBAC
- capacity and concurrency behavior
- audit logging
- rate limiting
- organizer management
- production/E2E readiness

## Current implementation

### Public registration

Implemented and verified by code inspection:

- Published + public + non-archived event gating
- Registration enabled/disabled setting
- Zod input validation
- Email normalization
- Consent must be explicitly accepted
- Optional authentication
- Idempotency-Key support
- Per-event capacity serialization using a database row lock
- Duplicate email protection
- Duplicate authenticated-user protection
- PENDING/CONFIRMED state based on approval setting
- Audit logging
- Dedicated public registration rate limit

### Organizer management

Implemented:

- Organizer RBAC through `registration:view` and `registration:manage`
- Tenant-scoped event lookup
- Registration settings read/update
- Registration list with status/search/pagination
- Registration status transition to CONFIRMED or CANCELLED
- Capacity check during organizer confirmation
- Cancellation reason
- Audit logging
- Mutation rate limiting
- Organizer Registration Management UI merged in PR #92, including event selection, search, status filtering, pagination, approval/cancellation actions, registration settings visibility, loading/empty/error states, and client-side permission visibility aligned with server RBAC

### Verification completed since the previous audit

- PR #91 added a regression test proving organizer confirmation cannot exceed configured registration capacity.
- PR #92 added the first production-facing organizer registration management UI layer.
- CI, Browser E2E, and Dependency Audit all passed on the PR #92 head before merge.

## Findings

### PASS — authorization/tenant isolation

Organizer routes resolve the event through `organizerIdsWithPermission()` before exposing registrations or changing settings/status. Registration records are subsequently resolved through their event ownership boundary.

### PASS — public registration concurrency

The event registration settings row is locked with `FOR UPDATE` before capacity is counted. This prevents concurrent requests from consuming the same final capacity slot.

### PASS — organizer confirmation capacity boundary

Organizer confirmation counts existing `CONFIRMED` registrations inside the transaction and rejects confirmation when configured capacity is already full. A capacity-1 regression test was added and passed through the normal CI gate in PR #91.

### PASS — idempotency foundation

Public registration supports a per-event idempotency key and returns the original registration on replay.

### PARTIAL PASS — registration lifecycle

The API supports PENDING, CONFIRMED and CANCELLED. However, there is currently no explicit organizer transition from CANCELLED back to a usable state. This should remain a deliberate business rule rather than being added implicitly.

### PARTIAL PASS — duplicate/re-registration policy

The Prisma model has a database-level unique constraint on `(eventId, email)` and `(eventId, userId)`. This means a cancelled registration cannot simply create a new registration for the same email/account.

The current API error text says an "active registration" already exists, but the database uniqueness rule applies to cancelled records as well. This is a product-rule mismatch that must be resolved before launch:

1. Treat cancellation as permanent for that event; or
2. Allow re-registration by implementing an explicit reactivation/re-registration lifecycle.

Do not silently weaken the database constraint.

### PARTIAL PASS — notifications

Registration creation, organizer confirmation, and cancellation currently create audit entries but do not have dedicated registration notification events. Registration notifications should be added after the lifecycle rule is finalized.

### PARTIAL PASS — analytics

Registration data is available for list/count operations, but a complete organizer registration analytics contract is not yet established for:

- total registrations
- pending
- confirmed
- cancelled
- capacity utilization
- conversion/approval rate
- registration trend over time
- no-show/check-in relationship

### PARTIAL PASS — organizer frontend

The organizer registration management UI is now implemented and merged in PR #92. The code path covers settings visibility, event selection, search/filter/pagination, pending approval, confirmation, cancellation, cancellation reason, loading/empty/error states, and permission-aware navigation/actions.

Browser E2E evidence for these organizer-specific flows is still missing. The existing Browser E2E suite passed on PR #92, but it did not specifically establish end-to-end coverage of the new organizer registration UI. These flows should remain PARTIAL until targeted browser coverage exists.

### NOT VERIFIED — export/bulk operations

No evidence was established for CSV/export or bulk confirm/cancel operations. These are not prerequisites for the core API lifecycle, but should be considered for organizer operational efficiency.

### NOT VERIFIED — production notification delivery

Even after notification events are added, real external email/push delivery remains a separate infrastructure verification task.

## Required next implementation order

1. Decide and encode the cancelled-registration re-registration policy.
2. Add targeted browser E2E coverage for organizer registration management.
3. Add registration notification events and delivery intents.
4. Add organizer registration analytics.
5. Add any required lifecycle/API regression coverage after the product policy is finalized.
6. Add export/bulk operations only if organizer workflows demonstrate the need.

## Production gate

Registration Foundation should not be marked complete until UI, API, database constraints, RBAC, lifecycle rules, notifications, analytics, and targeted E2E evidence agree.

## External PR-01 items deferred

Production Razorpay credential verification is intentionally deferred until credentials are provisioned. This does not block the independent Registration Foundation engineering work.
