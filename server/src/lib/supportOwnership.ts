import type { Prisma, User } from "@prisma/client";
import {
  exhibitorBusinessIdsWithPermission,
  isPlatformAdmin,
  organizerIdsWithPermission,
} from "./access";
import { prisma } from "./prisma";

/**
 * A support ticket belongs to exactly one customer tenant, or to neither
 * tenant when it originates from public platform intake (Contact Us/demo).
 * Platform Admin support remains on the separate platform support surface.
 */
export type SupportTicketOwnerContext =
  | { type: "organizer"; organizerId: string }
  | { type: "exhibitor"; exhibitorBusinessId: string };

export function hasExclusiveSupportTicketOwner(
  organizerId: string | null | undefined,
  exhibitorBusinessId: string | null | undefined,
): boolean {
  return !(organizerId && exhibitorBusinessId);
}

export function supportTicketOwnerWhere(
  owner: SupportTicketOwnerContext,
): Prisma.SupportTicketWhereInput {
  return owner.type === "organizer"
    ? { organizerId: owner.organizerId, exhibitorBusinessId: null }
    : { exhibitorBusinessId: owner.exhibitorBusinessId, organizerId: null };
}

/**
 * Resolve only tenant contexts the authenticated user currently controls.
 * Membership roles are evaluated by the central permission helpers. The
 * ExhibitorBusiness.ownerId relationship is also accepted as an explicit
 * owner grant, but suspended businesses are never returned.
 */
export async function getSupportTicketOwnerContexts(
  user: User,
): Promise<SupportTicketOwnerContext[]> {
  if (user.suspended || isPlatformAdmin(user)) return [];

  const [organizerIds, memberBusinessIds, ownedBusinesses] = await Promise.all([
    organizerIdsWithPermission(user, "dashboard:view"),
    exhibitorBusinessIdsWithPermission(user, "exhibitorBusiness:view"),
    prisma.exhibitorBusiness.findMany({
      where: { ownerId: user.id, suspended: false },
      select: { id: true },
    }),
  ]);

  const exhibitorBusinessIds = [
    ...new Set([...memberBusinessIds, ...ownedBusinesses.map((business) => business.id)]),
  ];

  return [
    ...organizerIds.map((organizerId) => ({ type: "organizer" as const, organizerId })),
    ...exhibitorBusinessIds.map((exhibitorBusinessId) => ({
      type: "exhibitor" as const,
      exhibitorBusinessId,
    })),
  ];
}

/**
 * Returns a validated tenant context or null. Callers must use the returned
 * context in the ticket query itself; checking ownership separately and then
 * querying by ticket ID alone would reintroduce an IDOR/BOLA race.
 */
export async function resolveSupportTicketOwnerContext(
  user: User,
  selection:
    | { type: "organizer"; organizerId: string }
    | { type: "exhibitor"; exhibitorBusinessId: string },
): Promise<SupportTicketOwnerContext | null> {
  if (
    (selection.type === "organizer" && !selection.organizerId.trim()) ||
    (selection.type === "exhibitor" && !selection.exhibitorBusinessId.trim())
  ) {
    return null;
  }

  const allowed = await getSupportTicketOwnerContexts(user);
  return allowed.find((owner) =>
    owner.type === "organizer"
      ? selection.type === "organizer" && owner.organizerId === selection.organizerId
      : selection.type === "exhibitor" && owner.exhibitorBusinessId === selection.exhibitorBusinessId,
  ) ?? null;
}
