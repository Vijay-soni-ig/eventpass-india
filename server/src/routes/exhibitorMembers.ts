import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { exhibitorMemberMutationRateLimit } from "../middleware/rateLimit";
import { can, exhibitorRoleToRole } from "../lib/permissions";

const router = Router();
router.use(requireAuth);

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
    include: { business: { select: { id: true, companyName: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({ memberships });
});

router.get("/:exhibitorBusinessId", async (req, res) => {
  const role = await getCallerRole(req.params.exhibitorBusinessId, req.user!.id);
  if (!role) return res.status(404).json({ error: "Exhibitor business not found" });
  const members = await prisma.exhibitorMembership.findMany({ where: { exhibitorBusinessId: req.params.exhibitorBusinessId }, orderBy: { createdAt: "asc" } });
  res.json({ members });
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

  const invitedUser = await prisma.user.findUnique({ where: { email: parsed.data.invitedEmail } });
  const member = await prisma.exhibitorMembership.create({
    data: {
      exhibitorBusinessId: req.params.exhibitorBusinessId,
      invitedEmail: parsed.data.invitedEmail,
      userId: invitedUser?.id,
      role: parsed.data.role,
      status: invitedUser ? "active" : "invited",
    },
  });
  res.status(201).json({ member });
});

const updateSchema = z.object({
  role: z.enum(["owner", "admin", "staff"]).optional(),
  status: z.enum(["active", "invited"]).optional(),
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
      await assertOwnerRoleInvariant(
        tx,
        target.exhibitorBusinessId,
        role,
        parsed.data.role ?? target.role,
        parsed.data.status ?? target.status,
        target.role === "owner" && target.status === "active",
      );
      return tx.exhibitorMembership.update({ where: { id: target.id }, data: parsed.data });
    });
    res.json({ member: updated });
  } catch (err) {
    if (err instanceof Error && /owner membership|active owner/.test(err.message)) {
      return res.status(409).json({ error: err.message });
    }
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
      await assertOwnerRoleInvariant(
        tx,
        target.exhibitorBusinessId,
        role,
        target.role,
        "deleted",
        target.role === "owner" && target.status === "active",
      );
      await tx.exhibitorMembership.delete({ where: { id: target.id } });
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
