import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitor } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireExhibitor);

async function getOwnBusinessId(userId: string) {
  const business = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: userId } });
  return business?.id ?? null;
}

router.get("/", async (req, res) => {
  const businessId = await getOwnBusinessId(req.user!.id);
  if (!businessId) return res.json({ members: [] });

  const members = await prisma.teamMember.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
  });
  res.json({ members });
});

const inviteSchema = z.object({
  invitedEmail: z.string().email(),
  role: z.enum(["owner", "finance", "operations", "marketing", "scanner"]),
});

router.post("/", async (req, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  let businessId = await getOwnBusinessId(req.user!.id);
  if (!businessId) {
    const business = await prisma.exhibitorBusiness.create({ data: { ownerId: req.user!.id } });
    businessId = business.id;
  }

  const member = await prisma.teamMember.create({
    data: { businessId, invitedEmail: parsed.data.invitedEmail, role: parsed.data.role },
  });
  res.status(201).json({ member });
});

const updateSchema = z.object({
  role: z.enum(["owner", "finance", "operations", "marketing", "scanner"]).optional(),
  status: z.enum(["active", "invited"]).optional(),
});

router.patch("/:id", async (req, res) => {
  const businessId = await getOwnBusinessId(req.user!.id);
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const member = await prisma.teamMember.findFirst({ where: { id: req.params.id, businessId: businessId ?? undefined } });
  if (!member) return res.status(404).json({ error: "Team member not found" });

  const updated = await prisma.teamMember.update({ where: { id: member.id }, data: parsed.data });
  res.json({ member: updated });
});

router.delete("/:id", async (req, res) => {
  const businessId = await getOwnBusinessId(req.user!.id);
  const member = await prisma.teamMember.findFirst({ where: { id: req.params.id, businessId: businessId ?? undefined } });
  if (!member) return res.status(404).json({ error: "Team member not found" });

  await prisma.teamMember.delete({ where: { id: member.id } });
  res.status(204).end();
});

export default router;
