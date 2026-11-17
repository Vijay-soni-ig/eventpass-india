# Phase 2 — Exhibitor Onboarding & KYC Workflow

## Status
Implementation branch: `feat/exhibitor-kyc-document-review-phase2`
Base: `main` after Phase 1 PR #886.

This document records the verified current-state audit and the implementation contract. It is not a claim that Phase 2 is complete.

## Verified current state

- `ExhibitorBusiness.kycStatus` uses the shared `KycStatus` enum with only `pending` and `verified`.
- `Document` belongs to an `ExhibitorBusiness` and currently stores name, private file reference, uploader, timestamps and archive state. It has no document category, review status, reviewer or rejection reason.
- `server/src/routes/documents.ts` already provides authenticated exhibitor-business-scoped upload, private download, archive and restore. It uses the existing upload middleware, rate limits, private storage namespace, business permission checks, membership-change locking and audit logging.
- Super Admin can currently toggle an exhibitor's KYC between pending and verified through `PATCH /api/platform/exhibitors/:id/kyc`. This action does not inspect submitted documents.
- The platform exhibitor detail view exposes the toggle but does not show a KYC document review queue or per-document decisions.
- Existing document tenant-isolation and lifecycle tests must remain green.

## Phase 2 objective

Deliver an auditable exhibitor KYC process without replacing the existing document storage, upload validation, business RBAC, or private download controls.

## Proposed document categories

- GST certificate
- PAN card
- Identity proof
- Authorization letter
- Bank proof
- Other / general document

The category is metadata only; the platform must not assume every exhibitor requires every category. Required-document rules should be configurable or explicitly defined by the product before hard enforcement.

## Proposed review lifecycle

Per KYC document:
- `pending_review`
- `approved`
- `rejected`

A rejected document must include a human-readable reason. Re-uploading/replacing a rejected document must preserve the previous record and its audit history (archive old record; create a new submission).

Aggregate exhibitor KYC lifecycle:
- `pending` — no complete submission yet / not yet submitted
- `submitted` — exhibitor has submitted documents for review
- `under_review` — an authorized platform reviewer has started review
- `verified` — reviewer approved the required submitted documents
- `resubmission_required` — at least one required document was rejected and exhibitor action is needed

Do not expand the shared Organizer `KycStatus` enum as a side effect. Prefer an exhibitor-specific aggregate status so organizer KYC behavior and existing filters remain backward compatible.

## Required implementation work

### Database
- Add an exhibitor-specific KYC status enum and field with a safe default/backfill.
- Add document category and review status fields with safe defaults for existing generic documents.
- Add reviewer user ID, reviewed timestamp and rejection reason.
- Add indexes for business/status and review queue queries.
- Keep document ownership FK and current soft-archive semantics.
- Add reversible/forward-safe Prisma migration; do not delete or rewrite existing document records.

### Exhibitor API and UX
- Extend the existing document upload route to accept a validated category while preserving current upload limits and storage validation.
- Add a submit-for-review action with server-side checks for business ownership, active membership, `document:manage`, and minimum submission completeness.
- Show aggregate KYC status, document categories, review results and rejection reasons.
- Permit replacement/resubmission without overwriting historical review evidence.
- Keep existing list/download/archive/restore behavior and multi-business selection rules.

### Super Admin API and UX
- Add a review queue with search, status filters, pagination and business context.
- Add private document preview/download using a platform-admin-only route; never expose storage keys or public URLs.
- Add approve/reject/request-resubmission actions with required reason validation for rejection.
- Recompute aggregate status transactionally from document decisions; do not trust a client-supplied aggregate status.
- Retain the current platform-admin middleware and mutation rate limiting.

### Security and audit
- Verify platform-admin authorization on every review and private-file access endpoint.
- Verify exhibitor business ownership and permission on submission endpoints.
- Prevent cross-tenant document IDOR/BOLA.
- Do not allow exhibitor users to change review status or reviewer fields.
- Audit submission, review start, approval, rejection, resubmission and replacement with actor, business, document and reason metadata.
- Keep file content private; validate file type/size using the existing middleware.

### Notifications
- Notify the exhibitor business owner/members with the appropriate permission when a review is rejected or KYC is verified, using the existing notification infrastructure after inspecting its delivery guarantees.
- Avoid sending duplicate notifications on retried requests; tie notification creation to successful state transitions.

### Verification gates
- Prisma schema validation and migration upgrade test.
- Unit/API tests for all allowed and rejected state transitions.
- Cross-business and non-admin access tests for review queue, document metadata and private downloads.
- File validation and upload cleanup regression tests.
- Audit-log assertions.
- Frontend typecheck, lint, build, accessibility checks.
- Browser E2E: exhibitor uploads categorized documents → submits KYC → Super Admin reviews → rejects with reason → exhibitor replaces document → Super Admin approves → exhibitor sees verified status.
- Confirm existing organizer KYC, generic document management, archive/restore and exhibitor permissions are unchanged.

## Explicit non-goals
- No live payment-provider activation.
- No OCR/AI document extraction in this phase.
- No changes to bank-account verification.
- No public document links.
- No hard-coded requirement that all document categories are mandatory until business policy is approved.
