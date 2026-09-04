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
  | 'scanner:use'
  | 'organizerMember:manage'
  | 'organizerMember:view'
  | 'exhibitionExhibitor:manage'
  | 'exhibitionExhibitor:view'
  | 'exhibitorBusiness:manage'
  | 'exhibitorBusiness:view'
  | 'exhibitorMember:manage'
  | 'exhibitorMember:view'
  | 'lead:capture'
  | 'lead:view'
  | 'lead:export'
  | 'platform:manage';

const ROLE_PERMISSIONS: Record<Exclude<Role, 'PLATFORM_ADMIN'>, Permission[]> = {
  ORGANIZER_OWNER: [
    'exhibition:create', 'exhibition:update', 'exhibition:delete', 'exhibition:view',
    'ticketType:manage', 'stall:manage', 'booking:view', 'payment:view', 'scanner:use',
    'organizerMember:manage', 'organizerMember:view',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_ADMIN: [
    'exhibition:create', 'exhibition:update', 'exhibition:delete', 'exhibition:view',
    'ticketType:manage', 'stall:manage', 'booking:view', 'payment:view', 'scanner:use',
    'organizerMember:manage', 'organizerMember:view',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_OPERATIONS: [
    'exhibition:create', 'exhibition:update', 'exhibition:delete', 'exhibition:view',
    'ticketType:manage', 'stall:manage', 'booking:view', 'scanner:use',
    'organizerMember:view',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_FINANCE: [
    'exhibition:view', 'booking:view', 'payment:view',
    'organizerMember:view', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_MARKETING: [
    'exhibition:view', 'organizerMember:view', 'exhibitionExhibitor:view',
  ],
  ORGANIZER_SCANNER: [
    'exhibition:view', 'scanner:use',
  ],
  EXHIBITOR_OWNER: [
    'exhibitorBusiness:manage', 'exhibitorBusiness:view',
    'exhibitorMember:manage', 'exhibitorMember:view',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
    'lead:capture', 'lead:view', 'lead:export',
  ],
  EXHIBITOR_ADMIN: [
    'exhibitorBusiness:manage', 'exhibitorBusiness:view',
    'exhibitorMember:manage', 'exhibitorMember:view',
    'exhibitionExhibitor:manage', 'exhibitionExhibitor:view',
    'lead:capture', 'lead:view', 'lead:export',
  ],
  EXHIBITOR_STAFF: [
    'exhibitorBusiness:view',
    'exhibitionExhibitor:view',
    'lead:capture', 'lead:view',
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
