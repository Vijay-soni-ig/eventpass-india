// Client-side mirror of server/src/lib/permissions.ts. This is for route
// guards and hiding controls the user has no access to — it is a UX
// convenience only. The server never trusts it: every API route re-checks
// the same permissions against real membership rows, so this file being
// wrong or bypassed can only ever make the UI misleading, never insecure.

export type Role =
  | 'PLATFORM_ADMIN'
  | 'ORGANIZER_OWNER'
  | 'ORGANIZER_ADMIN'
  | 'ORGANIZER_OPERATIONS'
  | 'ORGANIZER_FINANCE'
  | 'ORGANIZER_MARKETING'
  | 'ORGANIZER_SCANNER'
  | 'EXHIBITOR_OWNER'
  | 'EXHIBITOR_ADMIN'
  | 'EXHIBITOR_STAFF'
  | 'VISITOR';

export type Permission =
  | 'exhibition:create'
  | 'exhibition:update'
  | 'exhibition:delete'
  | 'exhibition:view'
  | 'ticketType:manage'
  | 'stall:manage'
  | 'booking:view'
  | 'payment:view'
  | 'payment:manage'
  | 'scanner:use'
  | 'checkin:override'
  | 'organizerMember:manage'
  | 'organizerMember:view'
  | 'organizerProfile:manage'
  | 'organizerGallery:manage'
  | 'exhibitionExhibitor:manage'
  | 'exhibitionExhibitor:view'
  | 'exhibitorBusiness:manage'
  | 'exhibitorBusiness:view'
  | 'exhibitorMember:manage'
  | 'exhibitorMember:view'
  | 'lead:capture'
  | 'lead:view'
  | 'lead:export'
  | 'lead:analytics'
  | 'document:manage'
  | 'document:view'
  | 'platform:manage';

const ROLE_PERMISSIONS: Record<Exclude<Role, 'PLATFORM_ADMIN'>, Permission[]> = {
  ORGANIZER_OWNER: [
    'exhibition:create', 'exhibition:update', 'exhibition:delete', 'exhibition:view',
    'ticketType:manage', 'stall:manage', 'booking:view', 'payment:view', 'payment:manage', 'scanner:use',
    'checkin:override', 'lead:analytics', 'lead:view', 'lead:export',
    'organizerMember:manage', 'organizerMember:view', 'organizerProfile:manage', 'organizerGallery:manage',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_ADMIN: [
    'exhibition:create', 'exhibition:update', 'exhibition:delete', 'exhibition:view',
    'ticketType:manage', 'stall:manage', 'booking:view', 'payment:view', 'payment:manage', 'scanner:use',
    'checkin:override', 'lead:analytics', 'lead:view', 'lead:export',
    'organizerMember:manage', 'organizerMember:view', 'organizerProfile:manage', 'organizerGallery:manage',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_OPERATIONS: [
    'exhibition:create', 'exhibition:update', 'exhibition:delete', 'exhibition:view',
    'ticketType:manage', 'stall:manage', 'booking:view', 'scanner:use',
    'organizerMember:view',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_FINANCE: [
    'exhibition:view', 'booking:view', 'payment:view', 'payment:manage',
    'organizerMember:view', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_MARKETING: [
    'exhibition:view', 'organizerMember:view', 'exhibitionExhibitor:view', 'lead:analytics', 'lead:view',
  ],
  ORGANIZER_SCANNER: [
    'exhibition:view', 'scanner:use',
  ],
  EXHIBITOR_OWNER: [
    'exhibitorBusiness:manage', 'exhibitorBusiness:view',
    'exhibitorMember:manage', 'exhibitorMember:view',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
    'document:manage', 'document:view',
    'lead:capture', 'lead:view', 'lead:export',
    'scanner:use', 'checkin:override',
  ],
  EXHIBITOR_ADMIN: [
    'exhibitorBusiness:manage', 'exhibitorBusiness:view',
    'exhibitorMember:manage', 'exhibitorMember:view',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
    'document:manage', 'document:view',
    'lead:capture', 'lead:view', 'lead:export',
    'scanner:use', 'checkin:override',
  ],
  EXHIBITOR_STAFF: [
    'exhibitorBusiness:view',
    'exhibitionExhibitor:view',
    'document:view',
    'lead:capture', 'lead:view',
    'scanner:use',
  ],
  VISITOR: [],
};

export function can(role: Role, permission: Permission): boolean {
  if (role === 'PLATFORM_ADMIN') return true;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export interface RoleContext {
  platformAdmin: boolean;
  organizer: { organizerId: string; name: string; role: Role }[];
  exhibitor: { exhibitorBusinessId: string; name: string | null; role: Role }[];
}

/** True if the user has `permission` in at least one organizer they belong to. */
export function hasOrganizerPermission(roles: RoleContext | undefined, permission: Permission): boolean {
  if (!roles) return false;
  if (roles.platformAdmin) return true;
  return roles.organizer.some((m) => can(m.role, permission));
}

/** True if the user has `permission` in at least one exhibitor business they belong to. */
export function hasExhibitorPermission(roles: RoleContext | undefined, permission: Permission): boolean {
  if (!roles) return false;
  if (roles.platformAdmin) return true;
  return roles.exhibitor.some((m) => can(m.role, permission));
}

/**
 * Where a logged-in user lands right after auth. Priority mirrors the
 * access model itself: a platform admin's own membership lists are
 * typically empty (see access.ts), so checking that first is required, not
 * just a tie-breaker. A user can hold both organizer and exhibitor
 * memberships at once — organizer wins because that's the more privileged
 * workspace. Falls back to the generic visitor dashboard when the user has
 * none of these roles.
 */
export function resolveHomeRoute(roles: RoleContext | undefined): string {
  if (!roles) return "/dashboard";
  if (roles.platformAdmin) return "/platform";
  if (roles.organizer.length > 0) return "/organizer";
  if (roles.exhibitor.length > 0) return "/exhibitor-dashboard";
  return "/dashboard";
}

/**
 * Filters a portal's nav items down to what this user may see. Items with
 * no `permission` (Dashboard, Settings, ...) always pass. This only hides
 * menu entries — it is not a security boundary, same as the rest of this
 * file; the server independently enforces every permission it checks.
 */
export function filterNavByPermission<T extends { permission?: Permission }>(
  items: T[],
  hasPermission: (permission: Permission) => boolean
): T[] {
  return items.filter((item) => !item.permission || hasPermission(item.permission));
}
