# ExhibitTix Roles & Permissions Matrix

Version: 1.0  
Status: Working production baseline  
Last reviewed: 2026-09-22  
Repository baseline: `main` at `37cd2015e8f2f1fb98be2a0af8064d6813e8b576`

## 1. Purpose

This document is the canonical authorization matrix for ExhibitTix.

It defines:

- platform, organizer, exhibitor, and visitor roles;
- the permissions currently implemented in the centralized permission service;
- the tenant/ownership boundary used to resolve each permission;
- important authorization invariants;
- lifecycle/suspension behavior;
- known implementation gaps and verification requirements.

Authorization is a server-side security control. UI visibility is not an authorization boundary.

### Evidence sources reviewed

- `server/src/lib/permissions.ts`
- `server/src/lib/access.ts`
- `server/src/middleware/auth.ts`
- `server/src/routes/auth.ts`
- `server/src/routes/exhibitorScanner.ts`
- `server/prisma/schema.prisma`
- `docs/product/PRD.md`
- `docs/product/BUSINESS_RULES_WORKFLOW_SPEC.md`

## 2. Status vocabulary

| Status | Meaning |
|---|---|
| IMPLEMENTED | Permission/authorization mechanism exists in the current repository. |
| VERIFIED | Current automated evidence explicitly proves the behavior. |
| PARTIAL | Core mechanism exists, but route-wide or production verification is incomplete. |
| PLANNED | Required but not implemented. |
| BLOCKED | Requires an external dependency or business/legal decision. |
| NOT VERIFIED | Implementation may exist, but current evidence is insufficient to claim verification. |

This document does not convert the existence of a permission constant into proof that every consuming route is correctly protected.

## 3. Identity and tenant model

ExhibitTix currently has two distinct membership axes:

1. **Organizer membership**
   - `OrganizerMembership`
   - scopes access to an `Organizer`
   - roles: owner, admin, operations, finance, marketing, scanner

2. **Exhibitor membership**
   - `ExhibitorMembership`
   - scopes access to an `ExhibitorBusiness`
   - roles: owner, admin, staff

There is also:

- **Platform role** on `User.platformRole`: `super_admin`
- **User type**: visitor, exhibitor, organizer — retained for compatibility and onboarding; it is not a substitute for membership authorization.
- **Resource ownership checks** for visitor-owned resources.

### Authorization resolution

For organizer-scoped permissions:

`organizerIdsWithPermission(user, permission)`

returns organizer IDs for which:

- the user has an active OrganizerMembership;
- the organizer is not suspended;
- the membership role grants the requested permission.

A platform admin receives all organizer IDs.

For exhibitor-business-scoped permissions:

`exhibitorBusinessIdsWithPermission(user, permission)`

returns business IDs for which:

- the user has an active ExhibitorMembership;
- the exhibitor business is not suspended;
- the membership role grants the requested permission.

A platform admin receives all exhibitor business IDs.

For exhibitor scanner access:

`exhibitionIdsForConfirmedExhibitor(user, permission)`

requires:

- active exhibitor membership;
- permitted exhibitor role;
- non-suspended business;
- confirmed ExhibitionExhibitor participation for the target exhibition.

This prevents a pure exhibitor tenant from gaining organizer access.

## 4. Role definitions

### 4.1 PLATFORM_ADMIN / Super Admin

Source: `User.platformRole = super_admin`.

Scope:

- platform-wide;
- all organizers;
- all exhibitor businesses;
- platform operations.

Implementation rule:

`can(PLATFORM_ADMIN, permission)` returns true for every declared permission.

This is intentionally a wildcard in the centralized permission layer. High-risk platform operations still require route-level authentication and must not bypass audit requirements.

Status: **IMPLEMENTED / PARTIAL verification**

### 4.2 Organizer roles

| Role | Intended responsibility |
|---|---|
| ORGANIZER_OWNER | Full organizer operational, financial, team, event, exhibitor, registration and lead-management access. |
| ORGANIZER_ADMIN | Administrative equivalent to owner in the current permission matrix. |
| ORGANIZER_OPERATIONS | Day-to-day event operations without financial or team-management authority. |
| ORGANIZER_FINANCE | Financial and booking visibility/management without operational editing authority. |
| ORGANIZER_MARKETING | Event/exhibitor/registration visibility and lead analytics/read access. |
| ORGANIZER_SCANNER | Minimal event context plus ticket scanning. |

### 4.3 Exhibitor roles

| Role | Intended responsibility |
|---|---|
| EXHIBITOR_OWNER | Full business/team/participation/document/lead/scanner access, including check-in override. |
| EXHIBITOR_ADMIN | Same declared permission set as owner in the current matrix. |
| EXHIBITOR_STAFF | Stall/event work: view business/participation, view documents, capture/view leads, scan tickets. No business/team management, lead export, document management, or check-in override. |

### 4.4 Visitor

VISITOR has no organizer/exhibitor permissions in the centralized matrix.

Visitor access is based on ownership of the visitor's own resources, such as their bookings/tickets, and must be enforced at the route/service layer.

Status: **IMPLEMENTED / PARTIAL verification**

## 5. Canonical permission matrix

Legend:

- **Y** = permission granted by the centralized role matrix
- **—** = not granted
- Resource ownership/tenant filtering remains mandatory even when Y is present.

| Permission | Platform Admin | Org Owner | Org Admin | Org Ops | Org Finance | Org Marketing | Org Scanner | Exh Owner | Exh Admin | Exh Staff | Visitor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| exhibition:create | Y | Y | Y | Y | — | — | — | — | — | — | — |
| exhibition:update | Y | Y | Y | Y | — | — | — | — | — | — | — |
| exhibition:delete | Y | Y | Y | Y | — | — | — | — | — | — | — |
| exhibition:view | Y | Y | Y | Y | Y | Y | Y | — | — | — | — |
| event:create | Y | Y | Y | Y | — | — | — | — | — | — | — |
| event:update | Y | Y | Y | Y | — | — | — | — | — | — | — |
| event:delete | Y | Y | Y | Y | — | — | — | — | — | — | — |
| event:view | Y | Y | Y | Y | Y | Y | Y | — | — | — | — |
| registration:view | Y | Y | Y | Y | — | Y | — | — | — | — | — |
| registration:manage | Y | Y | Y | Y | — | — | — | — | — | — | — |
| ticketType:manage | Y | Y | Y | Y | — | — | — | — | — | — | — |
| stall:manage | Y | Y | Y | Y | — | — | — | — | — | — | — |
| booking:view | Y | Y | Y | Y | Y | — | — | — | — | — | — |
| payment:view | Y | Y | Y | — | Y | — | — | — | — | — | — |
| payment:manage | Y | Y | Y | — | Y | — | — | — | — | — | — |
| scanner:use | Y | Y | Y | Y | — | — | Y | Y | Y | Y | — |
| checkin:override | Y | Y | Y | — | — | — | — | Y | Y | — | — |
| organizerMember:manage | Y | Y | Y | — | — | — | — | — | — | — | — |
| organizerMember:view | Y | Y | Y | Y | Y | Y | — | — | — | — | — |
| organizerProfile:manage | Y | Y | Y | — | — | — | — | — | — | — | — |
| organizerGallery:manage | Y | Y | Y | — | — | — | — | — | — | — | — |
| exhibitionExhibitor:manage | Y | Y | Y | Y | — | — | — | Y | Y | — | — |
| exhibitionExhibitor:view | Y | Y | Y | Y | Y | Y | — | Y | Y | Y | — |
| exhibitorBusiness:manage | Y | — | — | — | — | — | — | Y | Y | — | — |
| exhibitorBusiness:view | Y | — | — | — | — | — | — | Y | Y | Y | — |
| exhibitorMember:manage | Y | — | — | — | — | — | — | Y | Y | — | — |
| exhibitorMember:view | Y | — | — | — | — | — | — | Y | Y | — | — |
| lead:capture | Y | — | — | — | — | — | — | Y | Y | Y | — |
| lead:view | Y | Y | Y | — | — | Y | — | Y | Y | Y | — |
| lead:export | Y | Y | Y | — | — | — | — | Y | Y | — | — |
| lead:analytics | Y | Y | Y | — | — | Y | — | — | — | — | — |
| document:manage | Y | — | — | — | — | — | — | Y | Y | — | — |
| document:view | Y | — | — | — | — | — | — | Y | Y | Y | — |
| platform:manage | Y | — | — | — | — | — | — | — | — | — | — |

## 6. Important permission semantics

### 6.1 Permission is not ownership

A permission such as `exhibition:update` means the role may perform that class of action.

The route must still constrain the target resource to an organizer the caller is authorized to operate.

The correct model is:

`authenticated user` + `role permission` + `tenant/resource scope`

not permission alone.

### 6.2 Platform admin

Platform admin is global by design.

When resolved through organizer/exhibitor access helpers, the platform admin receives all organizer/business IDs.

This is powerful access and therefore should remain covered by audit logging for sensitive mutations.

### 6.3 Suspended organizers

Active organizer memberships are filtered out when the organizer is suspended.

Membership rows remain intact so reactivation can restore the existing membership relationship.

### 6.4 Suspended exhibitor businesses

Active exhibitor memberships are filtered out when the business is suspended.

This prevents suspension from becoming a cosmetic UI state.

### 6.5 Exhibitor scanner boundary

Scanner authorization is deliberately different from organizer authorization.

An exhibitor must have:

- active membership;
- a role with `scanner:use`;
- non-suspended business;
- confirmed participation in the target exhibition.

A confirmed participation is therefore part of the authorization boundary for exhibitor-side scanning.

## 7. Authentication prerequisites

The permission matrix assumes authenticated identity where protected access is required.

Current authentication behavior includes:

- bearer-token authentication;
- JWT verification;
- server-side auth-session validation;
- suspended-user rejection;
- `/api/auth/me` role-context resolution;
- rate limiting on authentication/session mutation flows.

Public routes may use optional authentication where explicitly designed.

A route must not treat optional authentication as authorization.

## 8. Route-level authorization requirements

Every protected endpoint must establish, in order:

1. Authentication.
2. Permission.
3. Tenant/resource scope.
4. Business-state rule.
5. Mutation-specific validation.
6. Audit/event recording where required.

Examples:

### Organizer exhibition mutation

Must verify:

- authenticated user;
- organizer permission such as `exhibition:update`;
- target exhibition belongs to an authorized organizer;
- target organizer is active;
- lifecycle/business-rule constraints permit the mutation.

### Organizer financial operation

Must verify:

- authenticated user;
- `payment:view` or `payment:manage` as applicable;
- target payment/order belongs to an authorized organizer;
- financial state transition is valid;
- idempotency/reconciliation rules are respected.

### Exhibitor lead access

Must verify:

- authenticated user;
- exhibitor permission;
- target lead belongs to an authorized exhibitor business;
- event/exhibition relationship is valid.

### Exhibitor scanner

Must verify:

- authenticated user;
- `scanner:use`;
- confirmed exhibitor participation in the target exhibition;
- ticket belongs to the target exhibition;
- ticket is paid/valid;
- duplicate check-in rules are enforced.

## 9. High-risk separation rules

The following boundaries are intentional:

| Boundary | Rule |
|---|---|
| Organizer vs exhibitor | Exhibitor permissions must never be resolved through OrganizerMembership. |
| Finance vs operations | Finance must not automatically receive exhibition/stall/ticket editing permissions. |
| Scanner vs admin | Scanner is intentionally narrow and cannot manage team/finance/event configuration. |
| Staff vs owner/admin | Exhibitor staff cannot manage the business/team, export leads, manage documents, or perform check-in overrides. |
| Visitor vs tenant roles | Visitor access is ownership-based, not a substitute for organizer/exhibitor permissions. |
| Frontend vs backend | Hidden UI controls never constitute security. |
| UserType vs membership | Legacy userType is not authoritative for tenant authorization. |

## 10. Legacy authorization structures requiring care

The schema contains both:

- `ExhibitorMembership` with owner/admin/staff roles; and
- legacy `TeamMember` with owner/finance/operations/marketing/scanner roles.

The centralized authorization layer currently maps:

- `ExhibitorMembership` -> EXHIBITOR_OWNER / EXHIBITOR_ADMIN / EXHIBITOR_STAFF
- `OrganizerMembership` -> organizer roles.

The coexistence of `TeamMember` and `ExhibitorMembership` is a documentation and migration risk.

Until explicitly migrated and verified, new authorization code should use the centralized `permissions.ts` + `access.ts` model rather than introducing another role-resolution mechanism.

Status: **PARTIAL — consolidation required before treating the role model as fully canonical across every legacy route.**

## 11. CRUD authorization expectations

For every important entity, authorization must be evaluated independently for:

- Create
- Read
- Update
- Delete/archive
- Search
- Filter
- Sort
- Pagination
- Bulk actions
- Restore
- Activate/deactivate
- Approve/reject
- Export

A role with Read permission must not implicitly gain mutation rights.

A role with mutation permission must still be constrained to its tenant and resource lifecycle.

Important financial, operational, and analytical records should use archive/soft-delete semantics where historical integrity is required.

## 12. Security requirements

The following are mandatory authorization tests:

### Authentication

- unauthenticated protected request -> 401;
- invalid token -> 401;
- expired/revoked session -> 401;
- suspended user -> 403.

### Tenant isolation

- organizer A cannot read organizer B resources;
- organizer A cannot mutate organizer B resources;
- exhibitor A cannot read exhibitor B resources;
- exhibitor cannot access organizer-only resources;
- cross-tenant IDs supplied directly in URLs/body are rejected.

### Privilege escalation

- operations cannot access finance permissions;
- finance cannot mutate operational resources;
- marketing cannot export leads unless explicitly granted;
- scanner cannot manage organizer members;
- exhibitor staff cannot perform owner/admin operations;
- visitor cannot call tenant management APIs.

### High-risk operations

- payment mutation;
- refund mutation;
- check-in override;
- bulk export;
- member role changes;
- event publication;
- stall allocation.

Each must be protected by both permission and resource scope.

## 13. Required audit behavior

Authorization-sensitive mutations should record enough audit context to answer:

- who acted;
- which role/membership authorized the action;
- which tenant/resource was targeted;
- what changed;
- when it happened;
- whether the operation succeeded or failed;
- relevant request/correlation identifier where available.

Audit records must not expose secrets, raw passwords, payment credentials, or sensitive tokens.

## 14. Verification matrix

| Area | Current status | Required evidence |
|---|---|---|
| Central permission definitions | IMPLEMENTED | Unit tests for role -> permission mapping |
| Organizer membership scope | IMPLEMENTED | Tenant-isolation integration tests |
| Exhibitor membership scope | IMPLEMENTED | Tenant-isolation integration tests |
| Platform admin wildcard | IMPLEMENTED | Platform-admin authorization tests |
| Suspended organizer blocking | IMPLEMENTED | Suspension regression tests |
| Suspended exhibitor blocking | IMPLEMENTED | Suspension regression tests |
| Exhibitor confirmed-participation scanner scope | IMPLEMENTED | Cross-exhibition scanner tests |
| Authentication/session gate | IMPLEMENTED | Auth integration/E2E evidence |
| Route-wide permission enforcement | PARTIAL | Endpoint inventory + route-by-route authorization audit |
| Legacy TeamMember consolidation | PARTIAL | Code inventory and migration decision |
| Visitor ownership authorization | PARTIAL | Route-level ownership test matrix |
| Sensitive mutation audit coverage | PARTIAL | Audit-log coverage mapped to endpoints |
| Full RBAC E2E | NOT VERIFIED | Cross-persona E2E suite with positive/negative cases |

## 15. Required QA scenarios

At minimum, the authorization test suite must cover:

1. Super Admin can access an organizer resource.
2. Organizer A cannot access Organizer B resource by changing the ID.
3. Organizer owner can perform owner permissions.
4. Organizer operations cannot view/manage payments.
5. Organizer finance cannot edit exhibitions or stalls.
6. Organizer marketing cannot export leads.
7. Organizer scanner cannot manage members.
8. Exhibitor owner can manage its own business.
9. Exhibitor admin can manage its own business.
10. Exhibitor staff cannot manage the business/team.
11. Exhibitor staff cannot export leads.
12. Exhibitor staff cannot override a duplicate check-in.
13. Exhibitor cannot scan tickets for an unconfirmed exhibition participation.
14. Exhibitor cannot scan tickets belonging to another exhibition.
15. Suspended organizer loses organizer tenant access.
16. Suspended exhibitor business loses exhibitor tenant access.
17. Visitor cannot call organizer/exhibitor management endpoints.
18. Revoked session cannot access protected endpoints.
19. Cross-tenant IDs cannot bypass authorization.
20. Bulk/export endpoints enforce the same tenant boundary as list/detail endpoints.

## 16. Business decisions still required

The following should not be silently inferred from the technical role matrix:

- whether Organizer Owner and Organizer Admin should remain identical;
- whether organizer Operations should be allowed to delete exhibitions;
- whether organizer Marketing should receive lead export;
- whether Finance should receive refund-specific permissions separate from generic payment management;
- whether exhibitor Admin should have exactly Owner permissions;
- whether check-in override should remain available to exhibitor Admin;
- whether visitor support agents require a dedicated support role;
- final legal/privacy rules for exported lead and visitor data;
- whether the legacy TeamMember model should be removed, migrated, or permanently supported.

These are product/business decisions and should be resolved before expanding the role model.

## 17. Implementation rule

No new route should introduce an ad-hoc authorization check when an existing centralized permission and access helper can express the requirement.

Preferred pattern:

`requireAuth` -> permission resolution -> tenant/resource filtering -> business-rule validation -> mutation -> audit

Authorization changes require:

- permission-matrix update;
- route/service update;
- positive and negative tests;
- tenant-isolation regression tests;
- documentation update;
- CI and browser/E2E verification where applicable.

## 18. Current conclusion

The centralized RBAC foundation is implemented and materially stronger than a simple `userType` check:

- platform admin is explicit;
- organizer and exhibitor memberships are distinct;
- permissions are centralized;
- tenant scope is resolved server-side;
- suspended tenants are excluded;
- exhibitor scanner access is tied to confirmed participation.

However, the repository should not yet be described as having a fully verified authorization system. Route-wide coverage, visitor ownership coverage, audit coverage, and legacy TeamMember consolidation still require evidence.

The next authorization hardening step is therefore **route-by-route RBAC verification**, not adding more roles.
