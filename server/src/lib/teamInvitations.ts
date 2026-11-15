import crypto from "crypto";
import { prisma } from "./prisma";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TeamInvitationKind = "organizer" | "exhibitor";

export function createInvitationToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function invitationExpiresAt(): Date {
  return new Date(Date.now() + INVITATION_TTL_MS);
}

export async function findInvitationByToken(token: string) {
  const hash = hashInvitationToken(token);
  const [organizer, exhibitor] = await Promise.all([
    prisma.organizerMembership.findUnique({ where: { invitationTokenHash: hash } }),
    prisma.exhibitorMembership.findUnique({ where: { invitationTokenHash: hash } }),
  ]);
  if (organizer) return { kind: "organizer" as const, membership: organizer };
  if (exhibitor) return { kind: "exhibitor" as const, membership: exhibitor };
  return null;
}

export async function acceptInvitation(token: string, userId: string, userEmail: string) {
  const found = await findInvitationByToken(token);
  if (!found) throw new Error("Invitation is invalid or has expired");
  if (found.membership.status !== "invited" || !found.membership.invitedEmail) {
    throw new Error("Invitation is no longer active");
  }

  const now = new Date();
  if (found.membership.invitationExpiresAt && found.membership.invitationExpiresAt.getTime() < now.getTime()) {
    throw new Error("Invitation has expired");
  }
  const normalizedUserEmail = userEmail.trim().toLowerCase();
  const invitedEmail = found.membership.invitedEmail.trim().toLowerCase();
  if (invitedEmail !== normalizedUserEmail) {
    throw new Error("This invitation was sent to a different email address");
  }

  // Consume the invitation with a conditional write. A read-then-update allows
  // concurrent requests to both observe "invited" and both report success.
  // Matching the hash, status, email and expiry in the UPDATE makes token use
  // atomic; only one request can transition this membership to active.
  if (found.kind === "organizer") {
    return prisma.$transaction(async (tx) => {
      const consumed = await tx.organizerMembership.updateMany({
        where: {
          id: found.membership.id,
          status: "invited",
          invitedEmail,
          invitationTokenHash: hashInvitationToken(token),
          organizer: { suspended: false },
          OR: [{ invitationExpiresAt: null }, { invitationExpiresAt: { gte: now } }],
        },
        data: {
          userId,
          status: "active",
          invitationTokenHash: null,
          invitationAcceptedAt: now,
        },
      });
      if (consumed.count !== 1) throw new Error("Invitation is invalid, expired, or already accepted");
      return tx.organizerMembership.findUniqueOrThrow({ where: { id: found.membership.id } });
    });
  }

  return prisma.$transaction(async (tx) => {
    // Match the lock order used by exhibitor membership mutations. This
    // serializes invitation acceptance against revocation, role changes and
    // business suspension instead of relying only on the invitation-row write.
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${found.membership.exhibitorBusinessId} FOR UPDATE`;

    // The token lookup above is only a preflight. Re-read the invitation after
    // acquiring the business lock so no stale invitation state is consumed.
    const currentInvitation = await tx.exhibitorMembership.findUnique({
      where: { id: found.membership.id },
      select: {
        id: true,
        exhibitorBusinessId: true,
        invitedEmail: true,
        status: true,
        invitationTokenHash: true,
        invitationExpiresAt: true,
      },
    });
    if (
      !currentInvitation ||
      currentInvitation.exhibitorBusinessId !== found.membership.exhibitorBusinessId ||
      currentInvitation.status !== "invited" ||
      currentInvitation.invitedEmail?.trim().toLowerCase() !== normalizedUserEmail ||
      currentInvitation.invitationTokenHash !== hashInvitationToken(token) ||
      (currentInvitation.invitationExpiresAt !== null && currentInvitation.invitationExpiresAt.getTime() < now.getTime())
    ) {
      throw new Error("Invitation is invalid, expired, or already accepted");
    }

    const consumed = await tx.exhibitorMembership.updateMany({
      where: {
        id: currentInvitation.id,
        exhibitorBusinessId: currentInvitation.exhibitorBusinessId,
        status: "invited",
        invitedEmail,
        invitationTokenHash: hashInvitationToken(token),
        business: { suspended: false },
        OR: [{ invitationExpiresAt: null }, { invitationExpiresAt: { gte: now } }],
      },
      data: {
        userId,
        status: "active",
        invitationTokenHash: null,
        invitationAcceptedAt: now,
      },
    });
    if (consumed.count !== 1) throw new Error("Invitation is invalid, expired, or already accepted");
    return tx.exhibitorMembership.findUniqueOrThrow({ where: { id: currentInvitation.id } });
  });
}

export function invitationUrl(token: string): string {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return `${base}/auth?redirect=${encodeURIComponent(`/team-invitations/accept?token=${encodeURIComponent(token)}`)}`;
}
