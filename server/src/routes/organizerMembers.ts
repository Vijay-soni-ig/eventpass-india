import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { organizerMemberMutationRateLimit } from "../middleware/rateLimit";
import { can, organizerRoleToRole } from "../lib/permissions";
import { lockOrganizerForEntitlement, assertCanInviteTeamMember, EntitlementError, sendEntitlementError, logEntitlementBlocked } from "../lib/entitlementService";
import { createInvitationToken, hashInvitationToken, invitationExpiresAt, invitationUrl } from "../lib/teamInvitations";
import { sendTeamInvitationEmail } from "../lib/notificationProviders";

const router = Router();
router.use(requireAuth);

async function getCallerRole(organizerId: string, userId: string) {
  const membership = await prisma.organizerMembership.findFirst({
    where: { organizerId, userId, status: "active", organizer: { suspended: false } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

function canManageMembers(role: Awaited<ReturnType<typeof getCallerRole>>) {
  return !!role && can(organizerRoleToRole(role), "organizerMember:manage");
}

function isOwner(role: Awaited<ReturnType<typeof getCallerRole>>) {
  return role === "owner";
}

async function assertOwnerRoleInvariant(
  tx: Prisma.TransactionClient,
  organizerId: string,
  callerRole: Awaited<ReturnType<typeof getCallerRole>>,
  targetRole: string,
  targetStatus: string,
  targetWasActiveOwner: boolean,
) {
  if ((targetRole === "owner" || targetWasActiveOwner) && !isOwner(callerRole)) {
    throw new Error("Only an organizer owner can assign, modify, or remove an owner membership");
  }

  const removesActiveOwner = targetWasActiveOwner && targetStatus !== "active";
  const demotesActiveOwner = targetWasActiveOwner && targetRole !== "owner";
  if (removesActiveOwner || demotesActiveOwner) {
    const activeOwnerCount = await tx.organizerMembership.count({
      where: { organizerId, role: "owner", status: "active" },
    });
    if (activeOwnerCount <= 1) {
      throw new Error("An organizer must retain at least one active owner");
    }
  }
}

router.get("/", async (req, res) => {
  const memberships = await prisma.organizerMembership.findMany({
    where: { userId: req.user!.id },
    include: { organizer: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({ memberships });
});

router.get("/:organizerId", async (req, res) => {
  const role = await getCallerRole(req.params.organizerId, req.user!.id);
  if (!role) return res.status(404).json({ error: "Organizer not found" });
  if (!can(organizerRoleToRole(role), "organizerMember:view")) {
    return res.status(403).json({ error: "Permission to view organizer members is required" });
  }
  const members = await prisma.organizerMembership.findMany({ where: { organizerId: req.params.organizerId }, orderBy: { createdAt: "asc" } });
  res.json({ members });
});

const inviteSchema = z.object({
  invitedEmail: z.string().email(),
  role: z.enum(["owner", "admin", "operations", "finance", "marketing", "scanner"]),
});

router.post("/:organizerId", organizerMemberMutationRateLimit, async (req, res) => {
  const role = await getCallerRole(req.params.organizerId, req.user!.id);
  if (!canManageMembers(role)) return res.status(403).json({ error: "Owner or admin access required" });
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (parsed.data.role === "owner" && !isOwner(role)) {
    return res.status(403).json({ error: "Only an organizer owner can invite another owner" });
  }

  const invitedEmail = parsed.data.invitedEmail.trim().toLowerCase();
  const token = createInvitationToken();
  try {
    const member = await prisma.$transaction(async (tx) => {
      // Serialize invitation creation per organizer, then re-check against
      // current state inside the lock. The pre-lock read alone permits two
      // concurrent requests to create duplicate pending invitations.
      await lockOrganizerForEntitlement(tx, req.params.organizerId);
      // Authorization can change while this request waits for the lock. Re-read
      // the caller's active membership before creating an invitation.
      const currentCaller = await tx.organizerMembership.findFirst({
        where: { organizerId: req.params.organizerId, userId: req.user!.id, status: "active", organizer: { suspended: false } },
        select: { role: true },
      });
      if (!currentCaller || !canManageMembers(currentCaller.role)) {
        throw new Error("Membership permissions changed; refresh and try again");
      }
      if (parsed.data.role === "owner" && currentCaller.role !== "owner") {
        throw new Error("Only an organizer owner can invite another owner");
      }
      const existing = await tx.organizerMembership.findFirst({
        where: { organizerId: req.params.organizerId, invitedEmail, status: { in: ["active", "invited"] } },
        select: { id: true },
      });
      if (existing) throw new Error("A team membership already exists for this email");
      await assertCanInviteTeamMember(tx, req.params.organizerId);
      return tx.organizerMembership.create({
        data: {
          organizerId: req.params.organizerId,
          invitedEmail,
          userId: null,
          role: parsed.data.role,
          status: "invited",
          invitationTokenHash: hashInvitationToken(token),
          invitationExpiresAt: invitationExpiresAt(),
        },
        include: { organizer: { select: { name: true } } },
      });
    });
    const delivery = await sendTeamInvitationEmail({
      recipientEmail: invitedEmail,
      organizationName: member.organizer.name,
      role: parsed.data.role,
      invitationUrl: invitationUrl(token),
    });
    if (!delivery.success) {
      // The provider may report failure after the recipient has already accepted.
      // Only remove the still-pending invitation; never delete an activated membership.
      await prisma.organizerMembership.deleteMany({
        where: { id: member.id, status: "invited", userId: null },
      });
      return res.status(503).json({ error: "Invitation could not be delivered. Please try again later." });
    }
    res.status(201).json({ member });
  } catch (err) {
    if (err instanceof Error && err.message === "A team membership already exists for this email") {
      return res.status(409).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Membership permissions changed; refresh and try again") {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof Error && err.message === "Only an organizer owner can invite another owner") {
      return res.status(403).json({ error: err.message });
    }
    if (err instanceof EntitlementError) {
      await logEntitlementBlocked(req.params.organizerId, req.user!.id, err);
      return sendEntitlementError(res, err);
    }
    throw err;
  }
});

// Membership status is controlled by the invitation lifecycle endpoints, not by
// generic role edits. Arbitrary status changes can bypass acceptance or strand members.
const updateSchema = z.object({
  role: z.enum(["owner", "admin", "operations", "finance", "marketing", "scanner"]).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one supported field must be provided",
});

router.patch("/member/:id", organizerMemberMutationRateLimit, async (req, res) => {
  const target = await prisma.organizerMembership.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Member not found" });

  const role = await getCallerRole(target.organizerId, req.user!.id);
  if (!canManageMembers(role)) return res.status(403).json({ error: "Owner or admin access required" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizers WHERE id = ${target.organizerId} FOR UPDATE`;
      // Revalidate caller and target after acquiring the same lock used by
      // membership mutations; the pre-transaction authorization may be stale.
      const currentCaller = await tx.organizerMembership.findFirst({
        where: { organizerId: target.organizerId, userId: req.user!.id, status: "active", organizer: { suspended: false } },
        select: { role: true },
      });
      if (!currentCaller || !canManageMembers(currentCaller.role)) {
        throw new Error("Membership permissions changed; refresh and try again");
      }
      const currentTarget = await tx.organizerMembership.findUnique({ where: { id: target.id } });
      if (!currentTarget) throw new Error("Member not found");
      await assertOwnerRoleInvariant(
        tx,
        currentTarget.organizerId,
        currentCaller.role,
        parsed.data.role ?? currentTarget.role,
        currentTarget.status,
        currentTarget.role === "owner" && currentTarget.status === "active",
      );
      return tx.organizerMembership.update({ where: { id: currentTarget.id }, data: parsed.data });
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

router.delete("/member/:id", organizerMemberMutationRateLimit, async (req, res) => {
  const target = await prisma.organizerMembership.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Member not found" });

  const role = await getCallerRole(target.organizerId, req.user!.id);
  if (!canManageMembers(role)) return res.status(403).json({ error: "Owner or admin access required" });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizers WHERE id = ${target.organizerId} FOR UPDATE`;
      const currentCaller = await tx.organizerMembership.findFirst({
        where: { organizerId: target.organizerId, userId: req.user!.id, status: "active", organizer: { suspended: false } },
        select: { role: true },
      });
      if (!currentCaller || !canManageMembers(currentCaller.role)) {
        throw new Error("Membership permissions changed; refresh and try again");
      }
      const currentTarget = await tx.organizerMembership.findUnique({ where: { id: target.id } });
      if (!currentTarget) throw new Error("Member not found");
      await assertOwnerRoleInvariant(
        tx,
        currentTarget.organizerId,
        currentCaller.role,
        currentTarget.role,
        "deleted",
        currentTarget.role === "owner" && currentTarget.status === "active",
      );
      await tx.organizerMembership.delete({ where: { id: currentTarget.id } });
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
