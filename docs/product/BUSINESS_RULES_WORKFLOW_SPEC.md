# ExhibitTix Business Rules & Workflow Specification

Version: 1.0
Status: Working production baseline
Last reviewed: 2026-09-22
Repository baseline: main after PR #141

## 1. Purpose

This is the canonical business-rule and lifecycle reference for ExhibitTix. It separates verified repository behavior from rules that still require business/legal decisions.

Status vocabulary:
- IMPLEMENTED — behavior exists in the repository.
- VERIFIED — behavior is covered by current automated evidence.
- PARTIAL — some required behavior exists, but the full rule is not proven.
- PLANNED — required but not yet implemented.
- BLOCKED — cannot be completed without an external dependency or business decision.
- NOT VERIFIED — implementation may exist, but current evidence is insufficient.

## 2. Universal Event lifecycle

The Universal Event foundation is additive to the legacy Exhibition domain.

Rules:
1. Event ownership is organizer-scoped.
2. Event routes must derive permitted organizer IDs server-side.
3. Frontend visibility is never an authorization boundary.
4. Exhibition-specific modules remain enabled only where applicable.

Status: IMPLEMENTED/PARTIAL — foundation exists; complete route-by-route migration is not yet proven.

## 3. Exhibition lifecycle

Current Exhibition status: draft, live, paused, completed.

Rules:
- Draft is editable before publication.
- Live is publicly operational according to visibility.
- Paused temporarily stops or limits the applicable operational flow.
- Completed represents an ended event.
- Public/private visibility is separate from lifecycle status.

Status: IMPLEMENTED. Full transition coverage across every route should remain regression-tested.

## 4. Exhibitor participation lifecycle

Current states: applied, approved, rejected, stall_pending, stall_reserved, payment_pending, confirmed, cancelled.

Rules:
1. One exhibitor business cannot have duplicate participation for the same exhibition.
2. Approval/rejection is organizer-controlled.
3. Stall allocation must belong to the same exhibition.
4. Reservation/payment state must be validated server-side.
5. Confirmed participation must not depend only on frontend payment state.
6. Cancellation must preserve historical/audit information.

Status: IMPLEMENTED/PARTIAL — core states and uniqueness exist; a complete cancellation/refund policy remains to be finalized.

## 5. Stall lifecycle

Current states: available, reserved, sold.

Rules:
- A stall may be reserved only if currently available under server-side transaction/concurrency rules.
- Reservation records reservedAt.
- Expired/cancelled reservations return to available where business rules permit.
- Sold stalls are not available for another booking.
- Payment success must be verified server-side before final commercial confirmation.
- Concurrent reservation attempts must not result in double allocation.

Floor-plan rule: FloorPlanObject is presentation-only. Stall remains the source of truth for price, availability, reservation, allocation and payment.

Status: IMPLEMENTED/VERIFIED for existing concurrency and expiry protections; full production gateway flow remains dependent on gateway configuration.

## 6. Floor-plan lifecycle

Current states: draft, published, archived.

Rules:
1. Draft plans may be edited.
2. A published plan is immutable through ordinary object mutation routes.
3. Publishing requires a valid current version and at least one valid object.
4. Objects must remain within canvas bounds.
5. A stall can appear at most once on a given floor plan.
6. All mapped stalls must belong to the same exhibition.
7. Concurrent publishes are serialized.
8. Stale organizer edits are rejected with HTTP 409 rather than overwriting newer changes.
9. Object mutation and floor-plan version increment occur transactionally.
10. Only the current published plan is operationally exposed as the published floor plan for an exhibition.

Status: VERIFIED — PR #141 added optimistic concurrency for organizer mutations; CI and Browser E2E passed before merge.

## 7. Ticket purchase lifecycle

Current payment states: created, pending, paid, failed, cancelled, refunded, partially_refunded.

Rules:
1. Ticket type belongs to the correct event/exhibition.
2. Price, quantity/capacity, visibility and applicable limits are validated server-side.
3. Order/payment intent is created before treating payment as successful.
4. Payment success is determined by trusted server-side verification/webhooks, not browser state.
5. Duplicate payment callbacks must be idempotent.
6. Capacity must remain safe under concurrent purchases.
7. A ticket is issued only after the applicable successful payment state.
8. Cancelled/refunded tickets must not be accepted for check-in.

Status: PARTIAL/VERIFIED — core models and hardening exist; live gateway configuration and full production reconciliation must be separately verified.

## 8. Registration lifecycle

Universal registration foundation exists.

Required lifecycle: created/submitted -> confirmed, with cancelled available where policy permits.

Rules:
- Registration belongs to the correct Event.
- Required fields and event-specific settings are validated server-side.
- Duplicate registrations are prevented according to configured policy.
- Cancellation must not silently delete historical registration evidence.
- Registration status changes should be auditable and notification-safe.

Status: PARTIAL — foundation and notification states exist; complete policy coverage must be verified per registration type.

## 9. Payment lifecycle

State machine:
created -> pending -> paid
created/pending -> failed
created/pending/paid -> cancelled where permitted
paid -> partially_refunded -> refunded
paid -> refunded

Rules:
1. Amounts are calculated server-side.
2. Pricing version is persisted with the payment.
3. Gateway/provider identifiers must be unique where defined.
4. Frontend success is not authoritative.
5. Webhook/provider signatures must be verified.
6. Duplicate webhook/payment events must be idempotent.
7. Payment transitions must not create duplicate commercial allocations.
8. Refund amount may not exceed refundable amount.
9. Refund requests require an idempotency key.
10. Refund records remain linked to the original payment.
11. Reporting distinguishes base amount, fees, taxes, refunds, organizer amount and platform revenue.

Status: IMPLEMENTED/PARTIAL — data model and hardening are present; live provider configuration and production reconciliation are not established by this document.

## 10. Refund lifecycle

Current states: REQUESTED -> PROCESSING -> SUCCEEDED, or REQUESTED/PROCESSING -> FAILED.

Rules:
- Refund reason is mandatory.
- Refund amount is validated against remaining refundable balance.
- Provider refund ID is unique.
- Repeated requests with the same payment/idempotency key do not create duplicate refunds.
- Successful refunds update refunded amount/payment state consistently.
- Booking/stall/ticket availability after refund follows commercial policy rather than blindly restoring inventory.

Status: IMPLEMENTED/PARTIAL — architecture exists; exact cancellation windows and customer-facing policy require business/legal confirmation.

## 11. QR ticket and check-in lifecycle

A check-in is valid only when the ticket belongs to the target event, exists and is valid, has an accepted paid state, is not cancelled/refunded, and has not already been checked in.

Duplicate check-ins must be rejected and logged.
Scanner authorization must be restricted to the correct organizer/event scope.

Status: IMPLEMENTED/PARTIAL — existing scanner and authorization coverage exists; full real-device/offline behavior is not verified here.

## 12. Lead lifecycle

Relationship: Visitor -> Event -> Exhibitor/Stall -> Interaction -> Lead -> Follow-up -> Analytics.

Rules:
- Lead retains event context.
- Exhibitor users access only leads permitted for their business/participation.
- Organizer users access only authorized event leads.
- Duplicate prevention follows the configured business identity/interaction rule.
- Follow-ups retain historical assignment/status information.
- Analytics distinguish raw interactions from qualified leads and conversions.

Status: IMPLEMENTED/PARTIAL — core models and workflows exist; one canonical duplicate-definition policy remains required.

## 13. Subscription and entitlement lifecycle

Current states: trialing, active, cancelled, expired, inactive.

Rules:
- Plan limits are enforced server-side.
- Entitlements cannot be bypassed by frontend-only checks.
- Subscription/plan changes preserve historical pricing/version evidence.
- Event, visitor, exhibitor, stall and team limits fail safely when exceeded.
- Administrative overrides require authorization and audit evidence.

Status: IMPLEMENTED/PARTIAL — commercial foundation and entitlement controls exist; complete billing/reconciliation depends on production payment configuration.

## 14. Authorization and tenancy

Non-negotiable rules:
- Organizer-owned mutations derive permitted organizer IDs server-side.
- Resource lookups enforce tenant scope.
- Exhibitor membership is a separate tenant axis from organizer membership.
- Super Admin access follows platform RBAC.
- Frontend hiding is not a security control.
- Cross-tenant IDs fail safely.
- Sensitive mutations require the correct permission and audit evidence.

Status: IMPLEMENTED/VERIFIED for audited areas; every new route must receive the same tenant-isolation review.

## 15. Audit and history

Important financial, access-control, booking, refund and operational mutations must retain sufficient history to answer who performed the action, what changed, when it changed, what operation occurred, and relevant source/context where supported.

Important historical records should use archive/soft-delete rather than destructive deletion when history matters.

Status: PARTIAL — audit infrastructure exists, but a canonical audit-event catalog remains a documentation requirement.

## 16. Notifications

Notifications must identify the relevant entity, be scoped to the correct user/organizer, avoid duplicate delivery through source-version/idempotency controls, respect preferences where applicable, and never be the source of truth for financial or booking state.

Current notification types include event publication/update/date changes, ticket availability, registration states and stall reservation expiry.

Status: IMPLEMENTED/PARTIAL.

## 17. Analytics

Financial metrics must separate gross/base amount, taxes, gateway fees, platform fees/revenue, refunds and net/organizer amount.

Operational metrics must distinguish registrations, ticket orders/tickets, check-ins, no-shows, stall occupancy, exhibitors, leads, qualified leads, follow-ups and conversions.

Analytics must use persisted server-side state rather than client UI state.

Status: PARTIAL — metrics exist across multiple services; a canonical metric dictionary remains required.

## 18. Required edge cases

Every critical workflow must test duplicate request, retry, stale version, concurrent mutation, concurrent booking, payment timeout, webhook retry, refund retry, reservation expiry, cancellation after payment, unauthorized tenant ID, archived resource, capacity boundary, zero/maximum quantities, malformed input, provider failure, partial refund and network interruption.

## 19. Business decisions still required

These are intentionally not invented:
1. Exact ticket/stall cancellation windows.
2. Refund eligibility by ticket/stall/payment state.
3. Whether fees/taxes are refundable and under which scenarios.
4. Lead duplicate-definition policy.
5. Registration duplicate policy.
6. Exact organizer approval policy for exhibitors.
7. Offline scanner behavior and conflict handling.
8. Customer-facing SLA/support policy.
9. Legal retention periods and privacy deletion exceptions.
10. Final tax/invoice policy by applicable jurisdiction.

## 20. Completion gate

DOC-002 is complete for implementation planning when each critical transition has an authoritative source of truth, allowed and forbidden transitions, authorization owner, transaction/concurrency rule, audit requirement, notification requirement, analytics effect, and test evidence status.

Business/legal decisions in §19 must remain explicitly unresolved rather than being treated as implementation defects.