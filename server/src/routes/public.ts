import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get("/exhibitions", async (_req, res) => {
  const exhibitions = await prisma.exhibition.findMany({
    where: { status: "live", visibility: "public" },
    include: { ticketTypes: { where: { visible: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json({ exhibitions });
});

router.get("/exhibitions/:id", async (req, res) => {
  const exhibition = await prisma.exhibition.findFirst({
    where: { id: req.params.id, status: "live", visibility: "public" },
    include: {
      ticketTypes: { where: { visible: true } },
      stalls: {
        where: { status: "available" },
        select: {
          id: true,
          code: true,
          stallType: true,
          size: true,
          price: true,
          status: true,
          posX: true,
          posY: true,
          width: true,
          height: true,
        },
      },
    },
  });
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });
  res.json({ exhibition });
});

export default router;
