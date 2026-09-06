import type { OrganizerMemberRole, ExhibitorMemberRole } from "@prisma/client";

// ----------------------------------------------------------------------------
// Centralized permission system. Every route in this API checks access
// through can(role, permission) instead of ad-hoc `userType`/`ownerId`
// comparisons. Roles are always resolved from real membership rows
// (OrganizerMembership / ExhibitorMembership / User.platformRole) — never
// from a single flat field.
// ----------------------------------------------------------------------------

export type Role =
  | "PLATFORM_ADMIN"
  | "ORGANIZER_OWNER"
  | "ORGANIZER_ADMIN"
  | "ORGANIZER_OPERATIONS"
  | "ORGANIZER_FINANCE"
  | "ORGANIZER_MARKETING"
  | "ORGANIZER_SCANNER"
  | "EXHIBITOR_OWNER"
  | "EXHIBITOR_ADMIN"
  | "EXHIBITOR_STAFF"
  | "VISITOR";

export type Permission =
  | "exhibition:create"
  | "exhibition:update"
  | "exhibition:delete"
  | "exhibition:view"
  | "ticketType:manage"
  | "stall:manage"
  | "booking:view"
  | "payment:view"
  | "payment:manage"
  | "scanner:use"
  | "checkin:override"
  | "organizerMember:manage"
  | "organizerMember:view"
  | "organizerProfile:manage"
  | "organizerGallery:manage"
  | "exhibitionExhibitor:manage"
  | "exhibitionExhibitor:view"
  | "exhibitorBusiness:manage"
  | "exhibitorBusiness:view"
  | "exhibitorMember:manage"
  | "exhibitorMember:view"
  | "lead:capture"
  | "lead:view"
  | "lead:export"
  | "lead:analytics"
  | "document:manage"
  | "document:view"
  | "platform:manage";

// PLATFORM_ADMIN is handled as a wildcard in can() below, not listed here.
const ROLE_PERMISSIONS: Record<Exclude<Role, "PLATFORM_ADMIN">, Permission[]> = {
  // Phase 21C: organizer roles get lead:view/lead:export (the same
  // permission names already used exhibitor-side) alongside the pre-existing
  // lead:analytics — a full lead list/detail/export for an organizer,
  // authorized through organizerIdsWithPermission exactly like every other
  // organizer permission, never through exhibitorBusinessIdsWithPermission.
  // This does not change what an exhibitor's own lead:view/lead:export
  // grants them, and does not let an organizer see another organizer's
  // leads (still scoped to organizerId, same as everything else here).
  ORGANIZER_OWNER: [
    "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view",
    "ticketType:manage", "stall:manage", "booking:view", "payment:view", "payment:manage", "scanner:use",
    "checkin:override", "lead:analytics", "lead:view", "lead:export",
    "organizerMember:manage", "organizerMember:view", "organizerProfile:manage", "organizerGallery:manage",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
  ],
  ORGANIZER_ADMIN: [
    "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view",
    "ticketType:manage", "stall:manage", "booking:view", "payment:view", "payment:manage", "scanner:use",
    "checkin:override", "lead:analytics", "lead:view", "lead:export",
    "organizerMember:manage", "organizerMember:view", "organizerProfile:manage", "organizerGallery:manage",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
  ],
  // Operations runs the show day-to-day, but has no visibility into money
  // and cannot manage who's on the team.
  ORGANIZER_OPERATIONS: [
    "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view",
    "ticketType:manage", "stall:manage", "booking:view", "scanner:use",
    "organizerMember:view",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
  ],
  // Finance sees money and bookings, but gets no operational permissions
  // (cannot edit exhibitions, tickets, stalls, or scan) — requirement: a
  // finance role must not automatically receive operational permissions.
  ORGANIZER_FINANCE: [
    "exhibition:view", "booking:view", "payment:view", "payment:manage",
    "organizerMember:view", "exhibitionExhibitor:view",
  ],
  // No marketing/campaign features exist yet, but lead conversion stats are
  // squarely a marketing concern, so this role gets read-only analytics.
  ORGANIZER_MARKETING: [
    "exhibition:view", "organizerMember:view", "exhibitionExhibitor:view", "lead:analytics", "lead:view",
  ],
  // Scanner can see exhibition context (to know what they're scanning for)
  // and scan, nothing else.
  ORGANIZER_SCANNER: [
    "exhibition:view", "scanner:use",
  ],
  // Phase 21B: exhibitors get their own scanner:use/checkin:override grant,
  // authorized through exhibitionIdsForConfirmedExhibitor (exhibitor
  // membership -> confirmed ExhibitionExhibitor -> exhibition), never
  // through organizerIdsWithPermission/OrganizerMembership. This is a
  // second grant of the same permission name for a different tenant axis —
  // not "exhibitors gaining organizer access".
  EXHIBITOR_OWNER: [
    "exhibitorBusiness:manage", "exhibitorBusiness:view",
    "exhibitorMember:manage", "exhibitorMember:view",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
    "document:manage", "document:view",
    "lead:capture", "lead:view", "lead:export",
    "scanner:use", "checkin:override",
  ],
  EXHIBITOR_ADMIN: [
    "exhibitorBusiness:manage", "exhibitorBusiness:view",
    "exhibitorMember:manage", "exhibitorMember:view",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
    "document:manage", "document:view",
    "lead:capture", "lead:view", "lead:export",
    "scanner:use", "checkin:override",
  ],
  // Staff can work the stall (capture/view leads, scan tickets) but cannot
  // manage the business profile, the team, upload/delete documents, export
  // lead data in bulk, or authorize a re-entry override.
  EXHIBITOR_STAFF: [
    "exhibitorBusiness:view",
    "exhibitionExhibitor:view",
    "document:view",
    "lead:capture", "lead:view",
    "scanner:use",
  ],
  // A visitor has no organizer/exhibitor permissions at all. Their access to
  // their own bookings is an ownership check (buyerUserId), not a
  // permission check — a fundamentally different axis, handled at the
  // route level rather than through this matrix.
  VISITOR: [],
};

export function can(role: Role, permission: Permission): boolean {
  if (role === "PLATFORM_ADMIN") return true;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function organizerRoleToRole(role: OrganizerMemberRole): Role {
  switch (role) {
    case "owner": return "ORGANIZER_OWNER";
    case "admin": return "ORGANIZER_ADMIN";
    case "operations": return "ORGANIZER_OPERATIONS";
    case "finance": return "ORGANIZER_FINANCE";
    case "marketing": return "ORGANIZER_MARKETING";
    case "scanner": return "ORGANIZER_SCANNER";
  }
}

export function exhibitorRoleToRole(role: ExhibitorMemberRole): Role {
  switch (role) {
    case "owner": return "EXHIBITOR_OWNER";
    case "admin": return "EXHIBITOR_ADMIN";
    case "staff": return "EXHIBITOR_STAFF";
  }
}
