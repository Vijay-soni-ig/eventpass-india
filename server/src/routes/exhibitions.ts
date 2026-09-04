import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { uploadCover, uploadFloorPlan, fileUrl } from "../middleware/upload";
import { resolveOrganizerId } from "../lib/organizer";
import { organizerIdsWithPermission, hasAnyOrganizerMembership } from "../lib/access";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

// "Managed" access (edit tickets/stalls/uploads) requires a membership role
// whose permissions include exhibition:update — not just being the
// original creator, matching the V2 rule that an Organizer (not a single
// user) owns the exhibition.
async function loadWithPermission(
  exhibitionId: string,
  user: Express.Request["user"],
  permission: Parameters<typeof organizerIdsWithPermission>[1],
) {
  const organizerIds = await organizerIdsWithPermission(user!, permission);
  if (organizerIds.length === 0) return null;
  return prisma.exhibition.findFirst({ where: { id: exhibitionId, organizerId: { in: organizerIds } } });
}

const loadManaged = (exhibitionId: string, user: Express.Request["user"]) =>
  loadWithPermission(exhibitionId, user, "exhibition:update");

router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:view");
  const exhibitions = organizerIds.length
    ? await prisma.exhibition.findMany({
        where: { organizerId: { in: organizerIds } },
        include: {
          ticketTypes: true,
          stalls: true,
          _count: { select: { ticketBookings: true, stallBookings: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ exhibitions });
});

const ticketInput = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  taxPercent: z.number().nonnegative().default(0),
  visible: z.boolean().default(true),
});

const stallInput = z.object({
  code: z.string().optional(),
  stallType: z.enum(["premium", "standard", "basic"]).optional(),
  size: z.string().optional(),
  price: z.number().nonnegative(),
  posX: z.number().optional(),
  posY: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["draft", "live", "paused", "completed"]).default("draft"),
  visibility: z.enum(["public", "private"]).default("public"),
  refundPolicy: z.string().optional(),
  terms: z.string().optional(),
  ticketTypes: z.array(ticketInput).default([]),
  stalls: z.array(stallInput).default([]),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { ticketTypes, stalls, startDate, endDate, ...rest } = parsed.data;
  const creatableOrganizerIds = await organizerIdsWithPermission(req.user!, "exhibition:create");
  let organizerId: string;
  if (creatableOrganizerIds.length > 0) {
    organizerId = creatableOrganizerIds[0];
  } else if (await hasAnyOrganizerMembership(req.user!.id)) {
    // Has a real membership (e.g. finance/marketing/scanner) but that role
    // doesn't grant exhibition:create — deny, never silently bootstrap a
    // second organizer as a side-channel around the permission check.
    return res.status(403).json({ error: "You do not have permission to create exhibitions" });
  } else {
    organizerId = await resolveOrganizerId(req.user!.id);
  }

  const exhibition = await prisma.exhibition.create({
    data: {
      ...rest,
      ownerId: req.user!.id,
      organizerId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      ticketTypes: { create: ticketTypes },
      stalls: { create: stalls },
    },
    include: { ticketTypes: true, stalls: true },
  });
  res.status(201).json({ exhibition });
});

router.get("/:id", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:view");
  const exhibition = organizerIds.length
    ? await prisma.exhibition.findFirst({
        where: { id: req.params.id, organizerId: { in: organizerIds } },
        include: { ticketTypes: true, stalls: true },
      })
    : null;
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });
  res.json({ exhibition });
});

const updateSchema = createSchema.partial().omit({ ticketTypes: true, stalls: true });

router.put("/:id", async (req, res) => {
  const existing = await loadManaged(req.params.id, req.user);
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { startDate, endDate, ...rest } = parsed.data;

  const exhibition = await prisma.exhibition.update({
    where: { id: existing.id },
    data: {
      ...rest,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
    include: { ticketTypes: true, stalls: true },
  });
  res.json({ exhibition });
});

router.delete("/:id", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:delete");
  const existing = organizerIds.length
    ? await prisma.exhibition.findFirst({ where: { id: req.params.id, organizerId: { in: organizerIds } } })
    : null;
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  await prisma.exhibition.delete({ where: { id: existing.id } });
  res.status(204).end();
});

router.post("/:id/duplicate", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:create");
  const existing = organizerIds.length
    ? await prisma.exhibition.findFirst({
        where: { id: req.params.id, organizerId: { in: organizerIds } },
        include: { ticketTypes: true, stalls: true },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const copy = await prisma.exhibition.create({
    data: {
      ownerId: req.user!.id,
      organizerId: existing.organizerId,
      name: `${existing.name} (Copy)`,
      category: existing.category,
      description: existing.description,
      venue: existing.venue,
      city: existing.city,
      startDate: existing.startDate,
      endDate: existing.endDate,
      status: "draft",
      visibility: existing.visibility,
      refundPolicy: existing.refundPolicy,
      terms: existing.terms,
      ticketTypes: {
        create: existing.ticketTypes.map((t) => ({
          name: t.name,
          price: t.price,
          quantity: t.quantity,
          taxPercent: t.taxPercent,
          visible: t.visible,
        })),
      },
      stalls: {
        create: existing.stalls.map((s) => ({
          code: s.code,
          stallType: s.stallType,
          size: s.size,
          price: s.price,
          posX: s.posX,
          posY: s.posY,
          width: s.width,
          height: s.height,
        })),
      },
    },
  });
  res.status(201).json({ exhibition: copy });
});

router.post("/:id/cover", uploadCover.single("cover"), async (req, res) => {
  const existing = await loadManaged(req.params.id, req.user);
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const coverImageUrl = fileUrl(req, "exhibition-covers", req.file.filename);
  const exhibition = await prisma.exhibition.update({ where: { id: existing.id }, data: { coverImageUrl } });
  res.json({ exhibition });
});

router.post("/:id/floor-plan", uploadFloorPlan.single("floorPlan"), async (req, res) => {
  const existing = await loadManaged(req.params.id, req.user);
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const floorPlanUrl = fileUrl(req, "floor-plans", req.file.filename);
  const exhibition = await prisma.exhibition.update({ where: { id: existing.id }, data: { floorPlanUrl } });
  res.json({ exhibition });
});

// -------- Ticket types --------

router.post("/:id/tickets", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "ticketType:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = ticketInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const ticket = await prisma.ticketType.create({ data: { ...parsed.data, exhibitionId: existing.id } });
  res.status(201).json({ ticket });
});

router.put("/:id/tickets/:ticketId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "ticketType:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = ticketInput.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const ticket = await prisma.ticketType.update({
    where: { id: req.params.ticketId, exhibitionId: existing.id },
    data: parsed.data,
  });
  res.json({ ticket });
});

router.delete("/:id/tickets/:ticketId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "ticketType:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  await prisma.ticketType.delete({ where: { id: req.params.ticketId, exhibitionId: existing.id } });
  res.status(204).end();
});

// -------- Stalls --------

router.post("/:id/stalls", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "stall:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = stallInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const stall = await prisma.stall.create({ data: { ...parsed.data, exhibitionId: existing.id } });
  res.status(201).json({ stall });
});

const stallUpdateInput = stallInput.partial().extend({
  status: z.enum(["available", "reserved", "sold"]).optional(),
  buyerName: z.string().nullable().optional(),
  buyerEmail: z.string().nullable().optional(),
});

router.put("/:id/stalls/:stallId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "stall:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = stallUpdateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const stall = await prisma.stall.update({
    where: { id: req.params.stallId, exhibitionId: existing.id },
    data: parsed.data,
  });
  res.json({ stall });
});

router.delete("/:id/stalls/:stallId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "stall:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  await prisma.stall.delete({ where: { id: req.params.stallId, exhibitionId: existing.id } });
  res.status(204).end();
});

// -------- Exhibition <-> Exhibitor participation (organizer side) --------
//
// The exhibitor applies (see exhibitorParticipations.ts); the organizer's
// only role here is to approve or reject that application, and to update
// the booth number once approved. Organizers do not create participations
// directly — that would recreate the "exhibitor is just assigned to an
// exhibition" shortcut this workflow replaces.

router.get("/:id/exhibitors", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "exhibitionExhibitor:view");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const participants = await prisma.exhibitionExhibitor.findMany({
    where: { exhibitionId: existing.id },
    include: { business: { select: { id: true, companyName: true } }, stalls: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ participants });
});

const reviewApplicationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  boothNumber: z.string().optional(),
});

router.patch("/:id/exhibitors/:participantId", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "exhibitionExhibitor:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const parsed = reviewApplicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const application = await prisma.exhibitionExhibitor.findFirst({
    where: { id: req.params.participantId, exhibitionId: existing.id },
  });
  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status !== "applied") {
    return res.status(400).json({ error: `Cannot review an application that is already ${application.status}` });
  }

  const participant = await prisma.exhibitionExhibitor.update({
    where: { id: application.id },
    data: { status: parsed.data.status, boothNumber: parsed.data.boothNumber },
  });
  res.json({ participant });
});

router.patch("/:id/exhibitors/:participantId/cancel", async (req, res) => {
  const existing = await loadWithPermission(req.params.id, req.user, "exhibitionExhibitor:manage");
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const application = await prisma.exhibitionExhibitor.findFirst({
    where: { id: req.params.participantId, exhibitionId: existing.id },
  });
  if (!application) return res.status(404).json({ error: "Application not found" });
  if (application.status === "cancelled" || application.status === "rejected") {
    return res.status(400).json({ error: `Already ${application.status}` });
  }

  const participant = await prisma.$transaction(async (tx) => {
    await tx.stall.updateMany({
      where: { exhibitionExhibitorId: application.id },
      data: { exhibitionExhibitorId: null, status: "available" },
    });
    return tx.exhibitionExhibitor.update({ where: { id: application.id }, data: { status: "cancelled" } });
  });
  res.json({ participant });
});

export default router;
