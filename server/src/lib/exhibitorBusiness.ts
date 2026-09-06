import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Resolves the ExhibitorBusiness tenant for a user, creating one (with an
 * "owner" ExhibitorMembership) the first time that user sets up a business
 * profile. Mirrors resolveOrganizerId's bootstrap pattern.
 *
 * Two concurrent first-time calls for the same brand-new user (e.g. a
 * double-click on "Apply" before any business/membership exists yet) both
 * pass the two lookups above and both attempt to create — this is a
 * TOCTOU window reproduced live while hardening the exhibitor-participation
 * endpoint that calls this. ExhibitorBusiness.ownerId is @unique, so the
 * loser's create throws P2002 instead of silently succeeding twice; catch
 * it and resolve to the winner's row rather than letting it propagate as an
 * unhandled rejection.
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

  try {
    const business = await prisma.exhibitorBusiness.create({
      data: {
        ownerId: userId,
        memberships: { create: { userId, role: "owner", status: "active" } },
      },
    });
    return business.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { ownerId: userId }, select: { id: true } });
      return winner.id;
    }
    throw err;
  }
}
