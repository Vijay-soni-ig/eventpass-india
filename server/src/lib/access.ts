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
    where: { userId: user.id, status: "active" },
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
    where: { userId: user.id, status: "active" },
    select: { exhibitorBusinessId: true, role: true },
  });
  return memberships.filter((m) => can(exhibitorRoleToRole(m.role), permission)).map((m) => m.exhibitorBusinessId);
}

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
      where: { userId: user.id, status: "active" },
      select: { organizerId: true, role: true, organizer: { select: { name: true } } },
    }),
    prisma.exhibitorMembership.findMany({
      where: { userId: user.id, status: "active" },
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
