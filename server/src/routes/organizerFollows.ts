import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { followRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

// Phase 22.1 — visitor/user -> organizer follow relationship. The actor here
// is the follower, not an organizer member, so this is mounted and gated
// independently of routes/organizerProfile.ts (which is about managing an
// organizer's own profile, authorized via OrganizerMembership).
const router = Router();

router.use(requireAuth);

async function getFollowState(organizerId: string, userId: string) {
  const [followerCount, existing] = await Promise.all([
    prisma.organizerFollow.count({ where: { organizerId } }),
    prisma.organizerFollow.findUnique({ where: { organizerId_userId: { organizerId, userId } } }),
  ]);
  return { following: !!existing, followerCount };
}

router.get("/:organizerId/follow-state", async (req, res) => {
  const organizer = await prisma.organizer.findFirst({
    where: { id: req.params.organizerId, publicProfileEnabled: true, suspended: false },
    select: { id: true },
  });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  res.json(await getFollowState(organizer.id, req.user!.id));
});

router.post("/:organizerId/follow", followRateLimit, async (req, res) => {
  const organizer = await prisma.organizer.findFirst({
    where: { id: req.params.organizerId, publicProfileEnabled: true, suspended: false },
    select: { id: true },
  });
  if (!organizer) return res.status(404).json({ error: "Organizer not found" });

  try {
    await prisma.organizerFollow.create({ data: { organizerId: organizer.id, userId: req.user!.id } });
    await logAudit({
      actorUserId: req.user!.id,
      action: "organizer.followed",
      entityType: "Organizer",
      entityId: organizer.id,
      metadata: { followerId: req.user!.id },
    });
  } catch (err) {
    // P2002 = already following (duplicate/race) — idempotent, not an error.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  res.json(await getFollowState(organizer.id, req.user!.id));
});

router.delete("/:organizerId/follow", followRateLimit, async (req, res) => {
  const organizerId = req.params.organizerId;
  const { count } = await prisma.organizerFollow.deleteMany({ where: { organizerId, userId: req.user!.id } });
  if (count > 0) {
    await logAudit({
      actorUserId: req.user!.id,
      action: "organizer.unfollowed",
      entityType: "Organizer",
      entityId: organizerId,
      metadata: { followerId: req.user!.id },
    });
  }

  res.json(await getFollowState(organizerId, req.user!.id));
});

export default router;
