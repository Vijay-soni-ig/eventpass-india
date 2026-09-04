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
  | "organizerMember:manage"
  | "organizerMember:view"
  | "exhibitionExhibitor:manage"
  | "exhibitionExhibitor:view"
  | "exhibitorBusiness:manage"
  | "exhibitorBusiness:view"
  | "exhibitorMember:manage"
  | "exhibitorMember:view"
  | "lead:capture"
  | "lead:view"
  | "lead:export"
  | "document:manage"
  | "document:view"
  | "platform:manage";

// PLATFORM_ADMIN is handled as a wildcard in can() below, not listed here.
const ROLE_PERMISSIONS: Record<Exclude<Role, "PLATFORM_ADMIN">, Permission[]> = {
  ORGANIZER_OWNER: [
    "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view",
    "ticketType:manage", "stall:manage", "booking:view", "payment:view", "payment:manage", "scanner:use",
    "organizerMember:manage", "organizerMember:view",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
  ],
  ORGANIZER_ADMIN: [
    "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view",
    "ticketType:manage", "stall:manage", "booking:view", "payment:view", "payment:manage", "scanner:use",
    "organizerMember:manage", "organizerMember:view",
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
  // No marketing/campaign features exist yet — read-only until they do.
  ORGANIZER_MARKETING: [
    "exhibition:view", "organizerMember:view", "exhibitionExhibitor:view",
  ],
  // Scanner can see exhibition context (to know what they're scanning for)
  // and scan, nothing else.
  ORGANIZER_SCANNER: [
    "exhibition:view", "scanner:use",
  ],
  EXHIBITOR_OWNER: [
    "exhibitorBusiness:manage", "exhibitorBusiness:view",
    "exhibitorMember:manage", "exhibitorMember:view",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
    "document:manage", "document:view",
    "lead:capture", "lead:view", "lead:export",
  ],
  EXHIBITOR_ADMIN: [
    "exhibitorBusiness:manage", "exhibitorBusiness:view",
    "exhibitorMember:manage", "exhibitorMember:view",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
    "document:manage", "document:view",
    "lead:capture", "lead:view", "lead:export",
  ],
  // Staff can work the stall (capture/view leads) but cannot manage the
  // business profile, the team, upload/delete documents, or export lead
  // data in bulk.
  EXHIBITOR_STAFF: [
    "exhibitorBusiness:view",
    "exhibitionExhibitor:view",
    "document:view",
    "lead:capture", "lead:view",
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
