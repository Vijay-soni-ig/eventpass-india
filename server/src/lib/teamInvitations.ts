import crypto from "crypto";
import { prisma } from "./prisma";
import { lockOrganizerForEntitlement } from "./entitlementService";

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

  const preflightNow = new Date();
  if (found.membership.invitationExpiresAt && found.membership.invitationExpiresAt.getTime() < preflightNow.getTime()) {
    throw new Error("Invitation has expired");
  }
  const normalizedUserEmail = userEmail.trim().toLowerCase();
  const invitedEmail = found.membership.invitedEmail.trim().toLowerCase();
  if (invitedEmail !== normalizedUserEmail) {
    throw new Error("This invitation was sent to a different email address");
  }

  // A pending membership must not already be bound to a user. Parent-row locks
  // serialize acceptance with membership mutation; the token lookup is only a
  // preflight and is revalidated after the lock is acquired.
  if (found.kind === "organizer") {
    return prisma.$transaction(async (tx) => {
      await lockOrganizerForEntitlement(tx, found.membership.organizerId);
      const currentInvitation = await tx.organizerMembership.findUnique({
        where: { id: found.membership.id },
        select: {
          id: true,
          organizerId: true,
          invitedEmail: true,
          status: true,
          userId: true,
          invitationTokenHash: true,
          invitationExpiresAt: true,
        },
      });
      const transactionNow = new Date();
      if (
        !currentInvitation ||
        currentInvitation.organizerId !== found.membership.organizerId ||
        currentInvitation.status !== "invited" ||
        currentInvitation.userId !== null ||
        currentInvitation.invitedEmail?.trim().toLowerCase() !== normalizedUserEmail ||
        currentInvitation.invitationTokenHash !== hashInvitationToken(token) ||
        (currentInvitation.invitationExpiresAt !== null && currentInvitation.invitationExpiresAt.getTime() < transactionNow.getTime())
      ) {
        throw new Error("Invitation is invalid, expired, or already accepted");
      }

      const consumed = await tx.organizerMembership.updateMany({
        where: {
          id: currentInvitation.id,
          organizerId: currentInvitation.organizerId,
          status: "invited",
          userId: null,
          invitedEmail: currentInvitation.invitedEmail!,
          invitationTokenHash: hashInvitationToken(token),
          organizer: { suspended: false },
          OR: [{ invitationExpiresAt: null }, { invitationExpiresAt: { gte: transactionNow } }],
        },
        data: {
          userId,
          status: "active",
          invitationTokenHash: null,
          invitationAcceptedAt: transactionNow,
        },
      });
      if (consumed.count !== 1) throw new Error("Invitation is invalid, expired, or already accepted");
      return tx.organizerMembership.findUniqueOrThrow({ where: { id: currentInvitation.id } });
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
        userId: true,
        invitationTokenHash: true,
        invitationExpiresAt: true,
      },
    });
    const transactionNow = new Date();
    if (
      !currentInvitation ||
      currentInvitation.exhibitorBusinessId !== found.membership.exhibitorBusinessId ||
      currentInvitation.status !== "invited" ||
      currentInvitation.userId !== null ||
      currentInvitation.invitedEmail?.trim().toLowerCase() !== normalizedUserEmail ||
      currentInvitation.invitationTokenHash !== hashInvitationToken(token) ||
      (currentInvitation.invitationExpiresAt !== null && currentInvitation.invitationExpiresAt.getTime() < transactionNow.getTime())
    ) {
      throw new Error("Invitation is invalid, expired, or already accepted");
    }

    const consumed = await tx.exhibitorMembership.updateMany({
      where: {
        id: currentInvitation.id,
        exhibitorBusinessId: currentInvitation.exhibitorBusinessId,
        status: "invited",
        userId: null,
        invitedEmail: currentInvitation.invitedEmail!,
        invitationTokenHash: hashInvitationToken(token),
        business: { suspended: false },
        OR: [{ invitationExpiresAt: null }, { invitationExpiresAt: { gte: transactionNow } }],
      },
      data: {
        userId,
        status: "active",
        invitationTokenHash: null,
        invitationAcceptedAt: transactionNow,
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
