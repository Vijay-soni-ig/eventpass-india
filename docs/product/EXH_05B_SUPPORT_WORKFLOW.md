# EXH-05B — Customer Support Workflow

**Status:** Design baseline for implementation  
**Parent phase:** EXH-05 Engagement & Support  
**Predecessor:** EXH-05A application and stall-payment notifications  
**Scope:** Authenticated organizer and exhibitor support, while preserving public contact/demo intake and Super Admin operations.

## 1. Existing implementation verified

The current codebase already contains:

- `SupportTicket` and `SupportTicketMessage` Prisma models.
- A Super Admin-only support console and API under `/api/platform/support`.
- Public Contact Us submissions stored as `SupportTicket(kind: support)`.
- Public demo requests stored as `SupportTicket(kind: demo_request)`, with a 24-hour per-email duplicate cooldown protected by a PostgreSQL advisory transaction lock.
- `SupportTicketMessage.isInternalNote` for staff-only notes.
- Organizer membership records with roles `owner`, `admin`, `operations`, `finance`, `marketing`, `scanner`.
- Exhibitor membership records with roles `owner`, `admin`, `staff` and status `active`, `invited`, `revoked`.

The platform support router applies `requireAuth` and `requirePlatformAdmin` at router level. The existing support list uses a fixed `take: 300`. Existing ticket message creation does not visibly write an audit record. These are known gaps to address in the implementation phases, not claims that the entire repository has been audited.

## 2. Ownership and authorization contract

### 2.1 Ticket ownership

Add an optional `exhibitorBusinessId` relation to `SupportTicket`. Keep `organizerId` as-is.

A ticket can have:
- `organizerId` set and `exhibitorBusinessId` null: organizer-owned customer support.
- `exhibitorBusinessId` set and `organizerId` null: exhibitor-business-owned customer support.
- Both null: platform/public intake records (including unauthenticated Contact Us and demo requests).

A ticket must never have both owner columns set. Add a PostgreSQL CHECK constraint in the migration; Prisma schema alone does not express this invariant. Do not force a tenant owner onto public marketing intake records.

For authenticated customer-created tickets, exactly one owner context is required. The server resolves and validates the selected owner against the caller's active membership. The client must never be trusted to provide `requesterUserId`, requester email, or a membership role.

### 2.2 Membership checks

- Organizer context: require a matching `OrganizerMembership` for `req.user.id`, with `status = active`. Use the existing project permission helpers and role policy; do not create a second competing RBAC system.
- Exhibitor context: require a matching `ExhibitorMembership` for `req.user.id`, with `status = active`, or the verified business-owner relationship through `ExhibitorBusiness.ownerId`. A revoked/invited membership must not grant access.
- If a user belongs to multiple organizations/businesses, they may select only an owner context returned by their server-authorized memberships.
- Never authorize by a client-supplied ticket ID alone. Every read, reply, and mutation must include the authorized tenant scope in the database query.
- Super Admin retains platform-wide access through the existing platform route and must not be forced through tenant membership helpers.

### 2.3 Customer-visible messages

- Customer APIs return only messages where `isInternalNote = false`.
- Customer APIs must reject or ignore attempts to set `isInternalNote = true`; only platform support staff may create internal notes.
- Do not serialize internal-note content in customer responses, nested ticket objects, notifications, search results, or error payloads.
- Platform staff APIs may see both public replies and internal notes.

## 3. Customer-facing API contract

Use authenticated routes under `/api/support/tickets` (exact router mount to follow existing API conventions).

- `GET /api/support/tickets`: list tickets for an explicitly selected authorized owner context; cursor/page pagination; bounded page size; stable ordering by `updatedAt DESC, id DESC`; filters limited to supported status/category; no cross-tenant aggregation by default.
- `POST /api/support/tickets`: create ticket. Server derives requester identity from the authenticated session and validates the owner context. Validate subject/body lengths, category, and allowed fields.
- `GET /api/support/tickets/:id`: tenant-scoped detail with public messages only.
- `POST /api/support/tickets/:id/messages`: add a public customer reply; reject empty/oversized body and internal-note flags.
- No customer endpoint may update assignment, priority, or internal status fields. Customers may request reopen through a defined action only if the ticket policy allows it.

Use consistent response envelopes and existing API error conventions. Return 404 for out-of-scope ticket IDs to avoid confirming another tenant's ticket existence.

## 4. Lifecycle and state rules

Initial lifecycle:
- `open` → `in_progress` → `waiting_customer` → `in_progress` → `resolved` → `closed`.
- Customer reply to `waiting_customer` reopens to `in_progress` (or the explicitly documented support policy state).
- Staff reply must not silently close a ticket.
- Reopening a `resolved`/ `closed` ticket must clear `resolvedAt` and create an audit event.
- Invalid transitions return 409 and do not mutate the ticket.

Keep existing status enum values for compatibility. Implement transition validation in one service used by both platform and customer paths. Do not duplicate transition rules in route handlers.

## 5. Audit and notifications

Audit the following actions with actor, ticket, tenant context, timestamp, and safe metadata:
- ticket created;
- public reply added;
- internal note added;
- status changed;
- priority changed;
- assignment/unassignment;
- ticket reopened/resolved/closed.

Do not place message bodies, credentials, payment data, or unnecessary personal data in audit metadata.

Use the existing notification/outbox infrastructure where available. Notifications must be idempotent and must not expose internal notes. Minimum events:
- ticket created → platform support queue;
- support public reply → ticket requester;
- staff public reply/status update → requester;
- customer reply → assigned support staff/queue;
- assignment change → newly assigned staff.

Notification delivery failure must not roll back a successfully persisted ticket/message. Use transactional outbox semantics and retry-safe delivery rather than sending email synchronously inside the request transaction.

## 6. UI scope

### Organizer
- Support entry in organizer dashboard/navigation.
- Ticket list with status, subject, category, last update, and unread/attention state if supported by the notification model.
- Create ticket, detail/timeline, public reply, empty/loading/error states.
- Only tickets belonging to the selected organizer context.

### Exhibitor
- Same core workflow, scoped to the selected exhibitor business.
- Do not expose another exhibitor's tickets to other team members or businesses.
- Apply the project's existing membership-role permission rules; the exact create/reply permissions must be aligned with current organizer/exhibitor permission helpers before implementation.

### Super Admin
- Preserve existing support console.
- Replace the fixed 300-row result cap with pagination.
- Validate assignee eligibility and audit message/internal-note actions.
- Ensure staff-only notes are visually distinct and never enter customer notification payloads.

## 7. Data migration and integrity

- Add nullable `exhibitorBusinessId` FK to `SupportTicket`, with `ON DELETE SET NULL` to preserve ticket history if a business is removed.
- Add indexes for `(exhibitorBusinessId, status, updatedAt)` and any query pattern proven by EXPLAIN/test.
- Add CHECK constraint: not both `organizerId` and `exhibitorBusinessId` are non-null.
- Preserve all existing tickets and messages; no destructive backfill is required because existing tickets are either organizer-owned or unowned.
- Keep financial and support history; use archive/retention policy rather than hard-delete for customer support records.
- Migration must be tested both on an empty database and an upgrade database containing existing public contact/demo and organizer-owned tickets.

## 8. Security and abuse controls

- Authentication on all customer ticket routes.
- Tenant-scoped authorization on every query and mutation (IDOR/BOLA tests required).
- Active membership and owner relationship checks on every request, not only at ticket creation.
- Rate-limit ticket creation and replies; enforce request-body limits and Zod maximum lengths.
- Normalize/validate text; render user content safely (no HTML injection).
- Do not accept arbitrary attachment URLs. Attachments are out of initial scope; if added later, require private object storage, MIME/content validation, size limits, malware scanning, signed access, and authorization.
- Protect against duplicate submits with request idempotency where the client may retry.
- Never leak internal notes, private staff identity fields, or other tenant data.

## 9. Required verification matrix

| Area | Required evidence |
|---|---|
| Prisma/migration | schema validation, migration deploy on empty DB, upgrade migration with existing ticket data |
| Unit | owner resolution, membership authorization, transition matrix, message visibility |
| API integration | create/list/detail/reply for organizer and exhibitor; invalid owner context; inactive/revoked membership |
| Tenant isolation | organizer A cannot read/update organizer B; exhibitor A cannot read/update exhibitor B; cross-kind IDs return 404 |
| Internal notes | customer detail/list/notification never contains internal note body |
| Audit | all listed staff/customer actions create expected audit records |
| Notifications | outbox row persisted atomically; retry/idempotency; failed delivery does not lose ticket/reply |
| Pagination | stable cursor ordering, no duplicates/missing rows across pages |
| UI/E2E | organizer and exhibitor full ticket lifecycle; Super Admin response; loading/empty/error states |
| Regression | public Contact Us, demo request cooldown, existing Super Admin support console, EXH-05A notifications |
| Security | IDOR/BOLA, role escalation, rate limits, XSS payloads, oversized payloads |

## 10. Delivery sequence

1. **EXH-05B-01 — Ownership foundation:** schema relation, migration/check constraint, shared owner-resolution/authorization service, focused unit and migration tests.
2. **EXH-05B-02 — Customer API:** organizer/exhibitor list/create/detail/reply endpoints, shared state transition service, audit coverage, API isolation tests.
3. **EXH-05B-03 — Customer UI:** organizer and exhibitor support inbox/detail/create/reply experiences and browser E2E.
4. **EXH-05B-04 — Operational hardening:** staff pagination/assignee validation, notification/outbox wiring, abuse controls, regression and production-readiness review.

Each delivery is a separate PR. Do not combine schema, API, UI, and notification changes into one high-risk PR. A phase is not complete until the relevant verification matrix is evidenced on the exact PR head SHA.

## 11. Explicit non-goals

- No live payment/Razorpay integration.
- No customer-visible internal notes.
- No file attachments in the initial support workflow.
- No new support-team role system unless existing platform role/access patterns prove insufficient.
- No destructive ticket deletion.
