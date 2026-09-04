import { prisma } from "./prisma";

/**
 * Resolves the ExhibitorBusiness tenant for a user, creating one (with an
 * "owner" ExhibitorMembership) the first time that user sets up a business
 * profile. Mirrors resolveOrganizerId's bootstrap pattern.
 */
export async function resolveExhibitorBusinessId(userId: string): Promise<string> {
  const existingMembership = await prisma.exhibitorMembership.findFirst({
    where: { userId, role: "owner", status: "active" },
    select: { exhibitorBusinessId: true },
  });
  if (existingMembership) return existingMembership.exhibitorBusinessId;

  // Legacy safety net: a business row that predates ExhibitorMembership
  // entirely shouldn't exist post-backfill, but don't orphan it if it does.
  const legacyOwned = await prisma.exhibitorBusiness.findUnique({
    where: { ownerId: userId },
    select: { id: true },
  });
  if (legacyOwned) return legacyOwned.id;

  const business = await prisma.exhibitorBusiness.create({
    data: {
      ownerId: userId,
      memberships: { create: { userId, role: "owner", status: "active" } },
    },
  });
  return business.id;
}
