import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { organizerMemberMutationRateLimit } from "../middleware/rateLimit";
import { can, organizerRoleToRole } from "../lib/permissions";
import { lockOrganizerForEntitlement, assertCanInviteTeamMember, EntitlementError, sendEntitlementError, logEntitlementBlocked } from "../lib/entitlementService";

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

  const invitedUser = await prisma.user.findUnique({ where: { email: parsed.data.invitedEmail } });
  try {
    const member = await prisma.$transaction(async (tx) => {
      await lockOrganizerForEntitlement(tx, req.params.organizerId);
      await assertCanInviteTeamMember(tx, req.params.organizerId);
      return tx.organizerMembership.create({
        data: {
          organizerId: req.params.organizerId,
          invitedEmail: parsed.data.invitedEmail,
          userId: invitedUser?.id,
          role: parsed.data.role,
          status: invitedUser ? "active" : "invited",
        },
      });
    });
    res.status(201).json({ member });
  } catch (err) {
    if (err instanceof EntitlementError) {
      await logEntitlementBlocked(req.params.organizerId, req.user!.id, err);
      return sendEntitlementError(res, err);
    }
    throw err;
  }
});

const updateSchema = z.object({
  role: z.enum(["owner", "admin", "operations", "finance", "marketing", "scanner"]).optional(),
  status: z.enum(["active", "invited"]).optional(),
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
      await assertOwnerRoleInvariant(
        tx,
        target.organizerId,
        role,
        parsed.data.role ?? target.role,
        parsed.data.status ?? target.status,
        target.role === "owner" && target.status === "active",
      );
      return tx.organizerMembership.update({ where: { id: target.id }, data: parsed.data });
    });
    res.json({ member: updated });
  } catch (err) {
    if (err instanceof Error && /owner membership|active owner/.test(err.message)) {
      return res.status(409).json({ error: err.message });
    }
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
      await assertOwnerRoleInvariant(
        tx,
        target.organizerId,
        role,
        target.role,
        "deleted",
        target.role === "owner" && target.status === "active",
      );
      await tx.organizerMembership.delete({ where: { id: target.id } });
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error && /owner membership|active owner/.test(err.message)) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
});

export default router;
