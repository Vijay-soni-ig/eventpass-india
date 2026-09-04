import { prisma } from "./prisma";

/**
 * Resolves the Organizer tenant for a user, creating one (with an "owner"
 * OrganizerMembership) the first time that user creates an exhibition.
 * This keeps exhibition creation working under the V2 schema without yet
 * building the organizer invite/management UI (a later phase).
 */
export async function resolveOrganizerId(userId: string): Promise<string> {
  const existingMembership = await prisma.organizerMembership.findFirst({
    where: { userId, role: "owner", status: "active" },
    select: { organizerId: true },
  });
  if (existingMembership) return existingMembership.organizerId;

  const [user, business] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, email: true } }),
    prisma.exhibitorBusiness.findUnique({ where: { ownerId: userId }, select: { companyName: true } }),
  ]);

  const organizer = await prisma.organizer.create({
    data: {
      name: business?.companyName || user?.fullName || user?.email || "Organizer",
      memberships: {
        create: { userId, role: "owner", status: "active" },
      },
    },
  });
  return organizer.id;
}
