import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { exhibitorMemberMutationRateLimit } from "../middleware/rateLimit";
import { can, exhibitorRoleToRole } from "../lib/permissions";
import { createInvitationToken, hashInvitationToken, invitationExpiresAt, invitationUrl } from "../lib/teamInvitations";
import { sendTeamInvitationEmail } from "../lib/notificationProviders";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth);

// Never serialize invitationTokenHash or other internal invitation metadata
// from membership records. API consumers receive only the fields required by
// the team UI and membership switcher.
const membershipResponseSelect = {
  id: true,
  exhibitorBusinessId: true,
  userId: true,
  invitedEmail: true,
  role: true,
  status: true,
  invitationExpiresAt: true,
  revokedAt: true,
  revokedByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExhibitorMembershipSelect;

async function getCallerRole(exhibitorBusinessId: string, userId: string) {
  const membership = await prisma.exhibitorMembership.findFirst({
    where: { exhibitorBusinessId, userId, status: "active", business: { suspended: false } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

function canManageMembers(role: Awaited<ReturnType<typeof getCallerRole>>) {
  return !!role && can(exhibitorRoleToRole(role), "exhibitorMember:manage");
}

function isOwner(role: Awaited<ReturnType<typeof getCallerRole>>) {
  return role === "owner";
}

async function assertOwnerRoleInvariant(
  tx: Prisma.TransactionClient,
  exhibitorBusinessId: string,
  callerRole: Awaited<ReturnType<typeof getCallerRole>>,
  targetRole: string,
  targetStatus: string,
  targetWasActiveOwner: boolean,
) {
  if ((targetRole === "owner" || targetWasActiveOwner) && !isOwner(callerRole)) {
    throw new Error("Only an exhibitor owner can assign, modify, or remove an owner membership");
  }

  const removesActiveOwner = targetWasActiveOwner && targetStatus !== "active";
  const demotesActiveOwner = targetWasActiveOwner && targetRole !== "owner";
  if (removesActiveOwner || demotesActiveOwner) {
    const activeOwnerCount = await tx.exhibitorMembership.count({
      where: { exhibitorBusinessId, role: "owner", status: "active" },
    });
    if (activeOwnerCount <= 1) {
      throw new Error("An exhibitor business must retain at least one active owner");
    }
  }
}

router.get("/", async (req, res) => {
  const memberships = await prisma.exhibitorMembership.findMany({
    where: { userId: req.user!.id },
    select: {
      ...membershipResponseSelect,
      business: { select: { id: true, companyName: true, suspended: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json({ memberships });
});

router.get("/:exhibitorBusinessId", async (req, res) => {
  // Use the same business-row lock as membership mutations so revocation,
  // role changes, and suspension cannot race the authorization and member read.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${req.params.exhibitorBusinessId} FOR UPDATE`;
    const currentCaller = await tx.exhibitorMembership.findFirst({
      where: {
        exhibitorBusinessId: req.params.exhibitorBusinessId,
        userId: req.user!.id,
        status: "active",
        business: { suspended: false },
      },
      select: { role: true },
    });
    if (!currentCaller) return { kind: "not_found" as const };
    if (!can(exhibitorRoleToRole(currentCaller.role), "exhibitorMember:view")) {
      return { kind: "forbidden" as const };
    }

    const members = await tx.exhibitorMembership.findMany({
      where: { exhibitorBusinessId: req.params.exhibitorBusinessId },
      select: membershipResponseSelect,
      orderBy: { createdAt: "asc" },
    });
    return { kind: "ok" as const, members };
  });

  if (result.kind === "not_found") {
    return res.status(404).json({ error: "Exhibitor business not found" });
  }
  if (result.kind === "forbidden") {
    return res.status(403).json({ error: "Permission to view exhibitor members is required" });
  }
  res.json({ members: result.members });
});

const inviteSchema = z.object({
  invitedEmail: z.string().email(),
  role: z.enum(["owner", "admin", "staff"]),
});

router.post("/:exhibitorBusinessId", exhibitorMemberMutationRateLimit, async (req, res) => {
  const role = await getCallerRole(req.params.exhibitorBusinessId, req.user!.id);
  if (!canManageMembers(role)) return res.status(403).json({ error: "Owner or admin access required" });

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (parsed.data.role === "owner" && !isOwner(role)) {
    return res.status(403).json({ error: "Only an exhibitor owner can invite another owner" });
  }

  const invitedEmail = parsed.data.invitedEmail.trim().toLowerCase();
  const token = createInvitationToken();
  let member;
  try {
    member = await prisma.$transaction(async (tx) => {
      // Serialize invitation creation for this business, then check for an
      // existing active/pending invitation while holding the parent-row lock.
      await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${req.params.exhibitorBusinessId} FOR UPDATE`;
      // Revalidate the caller after locking the business; role changes may have
      // committed after the initial authorization check.
      const currentCaller = await tx.exhibitorMembership.findFirst({
        where: { exhibitorBusinessId: req.params.exhibitorBusinessId, userId: req.user!.id, status: "active", business: { suspended: false } },
        select: { role: true },
      });
      if (!currentCaller || !canManageMembers(currentCaller.role)) {
        throw new Error("Membership permissions changed; refresh and try again");
      }
      if (parsed.data.role === "owner" && currentCaller.role !== "owner") {
        throw new Error("Only an exhibitor owner can invite another owner");
      }
      const existingMemberships = await tx.exhibitorMembership.findMany({
        where: { exhibitorBusinessId: req.params.exhibitorBusinessId, invitedEmail, status: { in: ["active", "invited"] } },
        select: { id: true, userId: true, status: true, invitationExpiresAt: true },
        orderBy: { createdAt: "desc" },
      });
      const now = new Date();
      const activeMembership = existingMemberships.find((membership) => membership.status === "active");
      const activeInvitation = existingMemberships.find((membership) =>
        membership.status === "invited" &&
        (membership.userId !== null || membership.invitationExpiresAt === null || membership.invitationExpiresAt >= now),
      );
      if (activeMembership || activeInvitation) {
        throw new Error("A team membership already exists for this email");
      }

      // An expired pending invitation should not permanently block the email.
      // Reuse the membership row, rotate its token, and reset its expiry so any
      // previously issued link can no longer be accepted.
      const expiredInvitation = existingMemberships.find((membership) =>
        membership.status === "invited" &&
        membership.userId === null &&
        membership.invitationExpiresAt !== null &&
        membership.invitationExpiresAt < now,
      );
      if (expiredInvitation) {
        return tx.exhibitorMembership.update({
          where: { id: expiredInvitation.id },
          data: {
            role: parsed.data.role,
            invitationTokenHash: hashInvitationToken(token),
            invitationExpiresAt: invitationExpiresAt(),
            invitationAcceptedAt: null,
          },
          include: { business: { select: { companyName: true } } },
        });
      }

      return tx.exhibitorMembership.create({
        data: {
          exhibitorBusinessId: req.params.exhibitorBusinessId,
          invitedEmail,
          userId: null,
          role: parsed.data.role,
          status: "invited",
          invitationTokenHash: hashInvitationToken(token),
          invitationExpiresAt: invitationExpiresAt(),
        },
        include: { business: { select: { companyName: true } } },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "A team membership already exists for this email") {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Membership permissions changed; refresh and try again") {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Only an exhibitor owner can invite another owner") {
      return res.status(403).json({ error: err.message });
    }
    throw err;
  }
  const delivery = await sendTeamInvitationEmail({
    recipientEmail: invitedEmail,
    organizationName: member.business.companyName ?? "your exhibitor business",
    role: parsed.data.role,
    invitationUrl: invitationUrl(token),
  });
  if (!delivery.success) {
    // The provider may report failure after the recipient has already accepted.
      // Only remove the still-pending invitation; never delete an activated membership.
      await prisma.exhibitorMembership.deleteMany({
        where: { id: member.id, status: "invited", userId: null },
      });
    return res.status(503).json({ error: "Invitation could not be delivered. Please try again later." });
  }
  res.status(201).json({
    member: {
      id: member.id,
      exhibitorBusinessId: member.exhibitorBusinessId,
      userId: member.userId,
      invitedEmail: member.invitedEmail,
      role: member.role,
      status: member.status,
      invitationExpiresAt: member.invitationExpiresAt,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    },
  });
});


/**
 * Resend a still-pending invitation. The business row is the serialization
 * boundary shared with acceptance, revocation, role changes and suspension.
 * Every resend rotates the single-use token, invalidating previously issued
 * links. The invitation remains pending if the email provider reports an
 * ambiguous failure; the caller can safely retry and no active membership is
 * ever deleted or rolled back.
 */
router.post("/:exhibitorBusinessId/member/:id/resend", exhibitorMemberMutationRateLimit, async (req, res) => {
  const { exhibitorBusinessId, id } = req.params;
  const role = await getCallerRole(exhibitorBusinessId, req.user!.id);
  if (!canManageMembers(role)) return res.status(403).json({ error: "Owner or admin access required" });

  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  let invitation: {
    id: string;
    exhibitorBusinessId: string;
    invitedEmail: string;
    role: string;
    invitationExpiresAt: Date | null;
    business: { companyName: string | null };
  };

  try {
    invitation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${exhibitorBusinessId} FOR UPDATE`;
      const currentCaller = await tx.exhibitorMembership.findFirst({
        where: { exhibitorBusinessId, userId: req.user!.id, status: "active", business: { suspended: false } },
        select: { role: true },
      });
      if (!currentCaller || !canManageMembers(currentCaller.role)) {
        throw new Error("Membership permissions changed; refresh and try again");
      }
      const target = await tx.exhibitorMembership.findFirst({
        where: { id, exhibitorBusinessId },
        select: {
          id: true,
          exhibitorBusinessId: true,
          invitedEmail: true,
          role: true,
          status: true,
          userId: true,
          invitationTokenHash: true,
          invitationExpiresAt: true,
          business: { select: { companyName: true, suspended: true } },
        },
      });
      if (!target || target.status !== "invited" || target.userId !== null || !target.invitedEmail || !target.invitationTokenHash) {
        throw new Error("Pending invitation not found");
      }
      if (target.business.suspended) throw new Error("Exhibitor business is suspended");
      if (target.role === "owner" && currentCaller.role !== "owner") {
        throw new Error("Only an exhibitor owner can resend an owner invitation");
      }
      const updated = await tx.exhibitorMembership.update({
        where: { id: target.id },
        data: { invitationTokenHash: tokenHash, invitationExpiresAt: invitationExpiresAt() },
        select: {
          id: true,
          exhibitorBusinessId: true,
          invitedEmail: true,
          role: true,
          invitationExpiresAt: true,
          business: { select: { companyName: true } },
        },
      });
      return updated;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Membership permissions changed; refresh and try again") {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Pending invitation not found") {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Exhibitor business is suspended") {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Only an exhibitor owner can resend an owner invitation") {
      return res.status(403).json({ error: err.message });
    }
    throw err;
  }

  const delivery = await sendTeamInvitationEmail({
    recipientEmail: invitation.invitedEmail,
    organizationName: invitation.business.companyName ?? "your exhibitor business",
    role: invitation.role,
    invitationUrl: invitationUrl(token),
  });
  if (!delivery.success) {
    return res.status(503).json({ error: "Invitation delivery could not be confirmed. You can safely retry sending it." });
  }

  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibitor_member.invitation_resent",
    entityType: "ExhibitorMembership",
    entityId: invitation.id,
    metadata: {
      exhibitorBusinessId,
      invitedEmail: invitation.invitedEmail,
      role: invitation.role,
      invitationExpiresAt: invitation.invitationExpiresAt?.toISOString() ?? null,
    },
  });

  return res.json({
    member: {
      id: invitation.id,
      exhibitorBusinessId: invitation.exhibitorBusinessId,
      userId: null,
      invitedEmail: invitation.invitedEmail,
      role: invitation.role,
      status: "invited",
      invitationExpiresAt: invitation.invitationExpiresAt,
    },
  });
});

// Membership status is controlled by invitation acceptance, not generic role
// edits. This prevents bypassing email acceptance or stranding active members.
const updateSchema = z.object({
  role: z.enum(["owner", "admin", "staff"]).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one supported field must be provided",
});

router.patch("/member/:id", exhibitorMemberMutationRateLimit, async (req, res) => {
  const target = await prisma.exhibitorMembership.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Member not found" });

  const role = await getCallerRole(target.exhibitorBusinessId, req.user!.id);
  if (!canManageMembers(role)) return res.status(403).json({ error: "Owner or admin access required" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM exhibitor_businesses WHERE id = ${target.exhibitorBusinessId} FOR UPDATE`;
      // Revalidate caller and target after acquiring the same lock used by
      // membership mutations; the pre-transaction authorization may be stale.
      const currentCaller = await tx.exhibitorMembership.findFirst({
        where: { exhibitorBusinessId: target.exhibitorBusinessId, userId: req.user!.id, status: "active", business: { suspended: false } },
        select: { role: true },
      });
      if (!currentCaller || !canManageMembers(currentCaller.role)) {
        throw new Error("Membership permissions changed; refresh and try again");
      }
      const currentTarget = await tx.exhibitorMembership.findUnique({ where: { id: target.id } });
      if (!currentTarget) throw new Error("Member not found");
      await assertOwnerRoleInvariant(
        tx,
        currentTarget.exhibitorBusinessId,
        currentCaller.role,
        parsed.data.role ?? currentTarget.role,
        currentTarget.status,
        currentTarget.role === "owner" && currentTarget.status === "active",
      );
      return tx.exhibitorMembership.update({
        where: { id: currentTarget.id },
        data: parsed.data,
        select: membershipResponseSelect,
      });
    });
    res.json({ member: updated });
  } catch (err) {
    if (err instanceof Error && /owner membership|active owner/.test(err.message)) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Membership permissions changed; refresh and try again") {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Member not found") return res.status(404).json({ error: err.message });
    throw err;
  }
});

router.delete("/member/:id", exhibitorMemberMutationRateLimit, async (req, res) => {
  const target = await prisma.exhibitorMembership.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Member not found" });

  const role = await getCallerRole(target.exhibitorBusinessId, req.user!.id);
  if (!canManageMembers(role)) return res.status(403).json({ error: "Owner or admin access required" });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM exhibitor_businesses WHERE id = ${target.exhibitorBusinessId} FOR UPDATE`;
      const currentCaller = await tx.exhibitorMembership.findFirst({
        where: { exhibitorBusinessId: target.exhibitorBusinessId, userId: req.user!.id, status: "active", business: { suspended: false } },
        select: { role: true },
      });
      if (!currentCaller || !canManageMembers(currentCaller.role)) {
        throw new Error("Membership permissions changed; refresh and try again");
      }
      const currentTarget = await tx.exhibitorMembership.findUnique({ where: { id: target.id } });
      if (!currentTarget) throw new Error("Member not found");
      await assertOwnerRoleInvariant(
        tx,
        currentTarget.exhibitorBusinessId,
        currentCaller.role,
        currentTarget.role,
        "deleted",
        currentTarget.role === "owner" && currentTarget.status === "active",
      );
      if (currentTarget.status === "revoked") throw new Error("Member not found");
      await tx.exhibitorMembership.update({
        where: { id: currentTarget.id },
        data: {
          status: "revoked",
          userId: null,
          invitationTokenHash: null,
          invitationExpiresAt: null,
          revokedAt: new Date(),
          revokedByUserId: req.user!.id,
        },
      });
    });
    await logAudit({
      actorUserId: req.user!.id,
      action: "exhibitor_member.revoked",
      entityType: "ExhibitorMembership",
      entityId: target.id,
      metadata: {
        exhibitorBusinessId: target.exhibitorBusinessId,
        previousUserId: target.userId,
        previousRole: target.role,
      },
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error && /owner membership|active owner/.test(err.message)) {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Membership permissions changed; refresh and try again") {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Member not found") return res.status(404).json({ error: err.message });
    throw err;
  }
});

export default router;
