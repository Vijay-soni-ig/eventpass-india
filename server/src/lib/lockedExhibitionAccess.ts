import type { Prisma, User } from "@prisma/client";
import { prisma } from "./prisma";
import { isPlatformAdmin } from "./access";
import { can, organizerRoleToRole, type Permission } from "./permissions";
import { lockOrganizerForEntitlement } from "./entitlementService";

type ExhibitionPermission = Extract<Permission, "scanner:use" | "checkin:override" | "booking:view">;

export type LockedExhibitionScope = {
  id: string;
  organizerId: string;
  eventId: string | null;
  status: string;
};

/**
 * Run a protected legacy Exhibition operation while holding the owning
 * organizer row and Exhibition row locks. Organizer membership mutations use
 * the same organizer lock; Exhibition lifecycle updates take the Exhibition
 * row lock. Re-read both authorization and lifecycle state after acquiring
 * the locks so an in-flight request cannot continue with stale permissions
 * or a stale live/paused status.
 */
export async function withLockedExhibitionAccess<T>(
  exhibitionId: string,
  user: User,
  permission: ExhibitionPermission,
  work: (tx: Prisma.TransactionClient, exhibition: LockedExhibitionScope) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.exhibition.findFirst({
      where: {
        id: exhibitionId,
        OR: [{ eventId: null }, { event: { archivedAt: null } }],
      },
      select: { id: true, organizerId: true, eventId: true },
    });
    if (!initial) return null;

    await lockOrganizerForEntitlement(tx, initial.organizerId);

    // Linked Event archive/restore writes lock the Event row. Take that lock
    // before the Exhibition row so check-in cannot proceed on a stale
    // archivedAt read. This matches Exhibition lifecycle updates, which lock
    // Event before updating the linked Exhibition.
    if (initial.eventId) {
      const linkedEvent = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "events"
        WHERE "id" = ${initial.eventId} AND "archivedAt" IS NULL
        FOR UPDATE
      `;
      if (linkedEvent.length === 0) return null;
    }

    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "exhibitions"
      WHERE "id" = ${exhibitionId} AND "organizerId" = ${initial.organizerId}
      FOR UPDATE
    `;
    if (locked.length === 0) return null;

    const exhibition = await tx.exhibition.findFirst({
      where: {
        id: exhibitionId,
        organizerId: initial.organizerId,
        eventId: initial.eventId,
        OR: [{ eventId: null }, { event: { archivedAt: null } }],
      },
      select: { id: true, organizerId: true, eventId: true, status: true },
    });
    if (!exhibition) return null;

    if (!isPlatformAdmin(user)) {
      const membership = await tx.organizerMembership.findFirst({
        where: {
          organizerId: exhibition.organizerId,
          userId: user.id,
          status: "active",
          organizer: { suspended: false },
        },
        select: { role: true },
      });
      if (!membership || !can(organizerRoleToRole(membership.role), permission)) return null;
    }

    return work(tx, exhibition);
  });
}
