import { prisma } from "./prisma";
import { can, organizerRoleToRole, exhibitorRoleToRole, type Permission } from "./permissions";
import type { User } from "@prisma/client";

export function isPlatformAdmin(user: User): boolean {
  return user.platformRole === "super_admin";
}

/**
 * Organizer ids the user has an active membership in whose role grants the
 * given permission. A Platform Admin gets every organizer (global access),
 * everyone else only the organizers where their own membership role passes
 * can(). An empty array means "no access to any organizer for this action".
 */
export async function organizerIdsWithPermission(user: User, permission: Permission): Promise<string[]> {
  if (isPlatformAdmin(user)) {
    const all = await prisma.organizer.findMany({ select: { id: true } });
    return all.map((o) => o.id);
  }
  const memberships = await prisma.organizerMembership.findMany({
    // A suspended organizer's own members lose access entirely — this is
    // what makes platform admin's activate/deactivate a real control, not
    // a cosmetic flag. Their membership rows are untouched (so reactivating
    // restores exactly what they had), only resolution is blocked.
    where: { userId: user.id, status: "active", organizer: { suspended: false } },
    select: { organizerId: true, role: true },
  });
  return memberships.filter((m) => can(organizerRoleToRole(m.role), permission)).map((m) => m.organizerId);
}

/** Same idea, scoped to ExhibitorBusiness / ExhibitorMembership. */
export async function exhibitorBusinessIdsWithPermission(user: User, permission: Permission): Promise<string[]> {
  if (isPlatformAdmin(user)) {
    const all = await prisma.exhibitorBusiness.findMany({ select: { id: true } });
    return all.map((b) => b.id);
  }
  const memberships = await prisma.exhibitorMembership.findMany({
    // A suspended exhibitor business's own members lose access entirely —
    // mirrors organizerIdsWithPermission's identical suspended-organizer
    // check above.
    where: { userId: user.id, status: "active", business: { suspended: false } },
    select: { exhibitorBusinessId: true, role: true },
  });
  return memberships.filter((m) => can(exhibitorRoleToRole(m.role), permission)).map((m) => m.exhibitorBusinessId);
}

/**
 * Exhibition ids this user is authorized to act on as an EXHIBITOR (never as
 * an organizer) for `permission` — restricted to exhibitions where at least
 * one of the user's exhibitor businesses has a CONFIRMED participation.
 * "confirmed" is deliberate: an exhibitor only earns gate/scanner access to
 * an exhibition once their own participation there is real, not merely
 * applied/approved/mid-payment. This is the authorization boundary for
 * Phase 21B's exhibitor-side scanner (see routes/exhibitorScanner.ts) — a
 * completely separate tenant axis from organizerIdsWithPermission, never
 * mixed with it, so a pure exhibitor account never gains organizer access.
 */
export async function exhibitionIdsForConfirmedExhibitor(user: User, permission: Permission): Promise<string[]> {
  if (isPlatformAdmin(user)) {
    const all = await prisma.exhibitionExhibitor.findMany({ where: { status: "confirmed" }, select: { exhibitionId: true } });
    return [...new Set(all.map((p) => p.exhibitionId))];
  }
  const memberships = await prisma.exhibitorMembership.findMany({
    where: { userId: user.id, status: "active", business: { suspended: false } },
    select: { exhibitorBusinessId: true, role: true },
  });
  const businessIds = memberships.filter((m) => can(exhibitorRoleToRole(m.role), permission)).map((m) => m.exhibitorBusinessId);
  if (businessIds.length === 0) return [];
  const participations = await prisma.exhibitionExhibitor.findMany({
    where: { exhibitorBusinessId: { in: businessIds }, status: "confirmed" },
    select: { exhibitionId: true },
  });
  return [...new Set(participations.map((p) => p.exhibitionId))];
}

// Deliberately NOT filtered by organizer.suspended — this answers "does the
// user already have a membership at all" so callers deny access with a
// clear error instead of silently bootstrapping a second organizer for
// someone whose real one is merely suspended (see organizerIdsWithPermission
// for the check that actually excludes suspended organizers).
export async function hasAnyOrganizerMembership(userId: string): Promise<boolean> {
  const count = await prisma.organizerMembership.count({ where: { userId, status: "active" } });
  return count > 0;
}

export async function hasAnyExhibitorMembership(userId: string): Promise<boolean> {
  const count = await prisma.exhibitorMembership.count({ where: { userId, status: "active" } });
  return count > 0;
}

/** Full role context for a user, used to build the /api/auth/me response. */
export async function getRoleContext(user: User) {
  const [organizerMemberships, exhibitorMemberships] = await Promise.all([
    prisma.organizerMembership.findMany({
      where: { userId: user.id, status: "active", organizer: { suspended: false } },
      select: { organizerId: true, role: true, organizer: { select: { name: true } } },
    }),
    prisma.exhibitorMembership.findMany({
      where: { userId: user.id, status: "active", business: { suspended: false } },
      select: { exhibitorBusinessId: true, role: true, business: { select: { companyName: true } } },
    }),
  ]);

  return {
    platformAdmin: isPlatformAdmin(user),
    organizer: organizerMemberships.map((m) => ({
      organizerId: m.organizerId,
      name: m.organizer.name,
      role: organizerRoleToRole(m.role),
    })),
    exhibitor: exhibitorMemberships.map((m) => ({
      exhibitorBusinessId: m.exhibitorBusinessId,
      name: m.business.companyName,
      role: exhibitorRoleToRole(m.role),
    })),
  };
}
