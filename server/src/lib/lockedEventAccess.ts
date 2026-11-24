import type { Prisma, User } from "@prisma/client";
import { prisma } from "./prisma";
import { isPlatformAdmin } from "./access";
import { can, organizerRoleToRole, type Permission } from "./permissions";
import { lockOrganizerForEntitlement } from "./entitlementService";

type EventPermission = Extract<Permission, "event:view" | "event:update">;

type EventScope = {
  id: string;
  organizerId: string;
};

/**
 * Run a protected Event operation while holding the owning organizer row lock.
 *
 * Membership revocation and role changes use the same organizer lock. Re-read
 * the Event and membership after acquiring it so an operation that was
 * authorized before waiting cannot continue with stale permissions.
 */
export async function withLockedEventAccess<T>(
  eventId: string,
  user: User,
  permission: EventPermission,
  work: (tx: Prisma.TransactionClient, event: EventScope) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const initialEvent = await tx.event.findFirst({
      where: { id: eventId, archivedAt: null },
      select: { id: true, organizerId: true },
    });
    if (!initialEvent) return null;

    await lockOrganizerForEntitlement(tx, initialEvent.organizerId);

    const event = await tx.event.findFirst({
      where: { id: eventId, organizerId: initialEvent.organizerId, archivedAt: null },
      select: { id: true, organizerId: true },
    });
    if (!event) return null;

    if (!isPlatformAdmin(user)) {
      const membership = await tx.organizerMembership.findFirst({
        where: {
          organizerId: event.organizerId,
          userId: user.id,
          status: "active",
          organizer: { suspended: false },
        },
        select: { role: true },
      });
      if (!membership || !can(organizerRoleToRole(membership.role), permission)) return null;
    }

    return work(tx, event);
  });
}
