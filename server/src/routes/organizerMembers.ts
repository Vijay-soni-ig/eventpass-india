import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { can, organizerRoleToRole } from "../lib/permissions";
import { lockOrganizerForEntitlement, assertCanInviteTeamMember, EntitlementError, sendEntitlementError, logEntitlementBlocked } from "../lib/entitlementService";

const router = Router();

router.use(requireAuth);

async function getCallerRole(organizerId: string, userId: string) {
  const membership = await prisma.organizerMembership.findFirst({
    where: { organizerId, userId, status: "active" },
    select: { role: true },
  });
  return membership?.role ?? null;
}

function canManageMembers(role: Awaited<ReturnType<typeof getCallerRole>>) {
  return !!role && can(organizerRoleToRole(role), "organizerMember:manage");
}

// My own memberships, across every organizer I belong to.
router.get("/", async (req, res) => {
  const memberships = await prisma.organizerMembership.findMany({
    where: { userId: req.user!.id },
    include: { organizer: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({ memberships });
});

// Full roster of one organizer — any active member may view it.
router.get("/:organizerId", async (req, res) => {
  const role = await getCallerRole(req.params.organizerId, req.user!.id);
  if (!role) return res.status(404).json({ error: "Organizer not found" });

  const members = await prisma.organizerMembership.findMany({
    where: { organizerId: req.params.organizerId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ members });
});

const inviteSchema = z.object({
  invitedEmail: z.string().email(),
  role: z.enum(["owner", "admin", "operations", "finance", "marketing", "scanner"]),
});

router.post("/:organizerId", async (req, res) => {
  const role = await getCallerRole(req.params.organizerId, req.user!.id);
  if (!canManageMembers(role)) {
    return res.status(403).json({ error: "Owner or admin access required" });
  }

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

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

router.patch("/member/:id", async (req, res) => {
  const target = await prisma.organizerMembership.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Member not found" });

  const role = await getCallerRole(target.organizerId, req.user!.id);
  if (!canManageMembers(role)) {
    return res.status(403).json({ error: "Owner or admin access required" });
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const updated = await prisma.organizerMembership.update({ where: { id: target.id }, data: parsed.data });
  res.json({ member: updated });
});

router.delete("/member/:id", async (req, res) => {
  const target = await prisma.organizerMembership.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Member not found" });

  const role = await getCallerRole(target.organizerId, req.user!.id);
  if (!canManageMembers(role)) {
    return res.status(403).json({ error: "Owner or admin access required" });
  }

  await prisma.organizerMembership.delete({ where: { id: target.id } });
  res.status(204).end();
});

export default router;
