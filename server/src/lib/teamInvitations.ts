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
  if (found.membership.invitationExpiresAt && found.membership.invitationExpiresAt.getTime() < Date.now()) {
    throw new Error("Invitation has expired");
  }
  if (found.membership.invitedEmail.toLowerCase() !== userEmail.toLowerCase()) {
    throw new Error("This invitation was sent to a different email address");
  }

  if (found.kind === "organizer") {
    return prisma.organizerMembership.update({
      where: { id: found.membership.id },
      data: { userId, status: "active", invitationTokenHash: null, invitationAcceptedAt: new Date() },
    });
  }

  return prisma.exhibitorMembership.update({
    where: { id: found.membership.id },
    data: { userId, status: "active", invitationTokenHash: null, invitationAcceptedAt: new Date() },
  });
}

export function invitationUrl(token: string): string {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
  return `${base}/team-invitations/accept?token=${encodeURIComponent(token)}`;
}
