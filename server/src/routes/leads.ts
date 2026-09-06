import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";
import { getExhibitorAnalytics } from "../lib/analyticsService";
import type { Prisma, User } from "@prisma/client";
import { dateString } from "../lib/validation";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

const leadInclude = {
  exhibitionExhibitor: { include: { exhibition: { select: { id: true, name: true, city: true } }, business: { select: { id: true, companyName: true } } } },
  ticketBooking: { select: { id: true, attendeeName: true, attendeeEmail: true, attendeePhone: true } },
  capturedByUser: { select: { id: true, fullName: true, email: true } },
  assignedToUser: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.LeadInclude;

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(["new", "contacted", "interested", "negotiation", "converted", "lost"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  exhibitionId: z.string().optional(),
  assignedToUserId: z.string().optional(),
});

async function buildScopedWhere(user: User, permission: "lead:view" | "lead:export", query: unknown) {
  const businessIds = await exhibitorBusinessIdsWithPermission(user, permission);
  const parsed = listQuerySchema.safeParse(query);
  const filters = parsed.success ? parsed.data : {};

  const where: Prisma.LeadWhereInput = {
    exhibitionExhibitor: {
      exhibitorBusinessId: { in: businessIds },
      ...(filters.exhibitionId ? { exhibitionId: filters.exhibitionId } : {}),
    },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.assignedToUserId ? { assignedToUserId: filters.assignedToUserId } : {}),
    ...(filters.search
      ? {
          OR: [
            { visitorName: { contains: filters.search, mode: "insensitive" } },
            { visitorEmail: { contains: filters.search, mode: "insensitive" } },
            { visitorPhone: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return { where, businessIds };
}

router.get("/", async (req, res) => {
  const { where, businessIds } = await buildScopedWhere(req.user!, "lead:view", req.query);
  const leads = businessIds.length
    ? await prisma.lead.findMany({ where, include: leadInclude, orderBy: { createdAt: "desc" } })
    : [];
  res.json({ leads });
});

router.get("/export", async (req, res) => {
  const exportIds = await exhibitorBusinessIdsWithPermission(req.user!, "lead:export");
  if (exportIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to export leads" });
  }
  const { where } = await buildScopedWhere(req.user!, "lead:export", req.query);
  const leads = await prisma.lead.findMany({ where, include: leadInclude, orderBy: { createdAt: "desc" } });

  const header = ["Name", "Email", "Phone", "Exhibition", "Status", "Priority", "Assigned To", "Follow-up Date", "Notes", "Captured At"];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = leads.map((l) =>
    [
      l.visitorName ?? l.ticketBooking?.attendeeName ?? "",
      l.visitorEmail ?? l.ticketBooking?.attendeeEmail ?? "",
      l.visitorPhone ?? l.ticketBooking?.attendeePhone ?? "",
      l.exhibitionExhibitor.exhibition.name,
      l.status,
      l.priority,
      l.assignedToUser?.fullName ?? l.assignedToUser?.email ?? "",
      l.followUpDate ? new Date(l.followUpDate).toISOString().slice(0, 10) : "",
      l.notes ?? "",
      new Date(l.capturedAt).toISOString(),
    ]
      .map(escape)
      .join(",")
  );
  const csv = [header.map(escape).join(","), ...rows].join("\n");

  await logAudit({ actorUserId: req.user!.id, action: "lead.exported", entityType: "Lead", metadata: { count: leads.length } });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="leads-${Date.now()}.csv"`);
  res.send(csv);
});

const analyticsQuerySchema = z.object({ from: dateString.optional(), to: dateString.optional() });

router.get("/analytics", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "lead:view");
  if (businessIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to view lead analytics" });
  }
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  // A user could belong to more than one exhibitor business; analytics are
  // reported per-business, using the first one they have lead:view on.
  const analytics = await getExhibitorAnalytics(businessIds[0], {
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
  });
  res.json(analytics);
});

router.get("/:id", async (req, res) => {
  const { where } = await buildScopedWhere(req.user!, "lead:view", req.query);
  const lead = await prisma.lead.findFirst({ where: { ...where, id: req.params.id }, include: leadInclude });
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead });
});

// -------- Capture a lead (scan a visitor's ticket, or manual entry) --------

const captureSchema = z
  .object({
    exhibitionExhibitorId: z.string(),
    ticketBookingId: z.string().optional(),
    visitorName: z.string().optional(),
    visitorEmail: z.string().email().optional(),
    visitorPhone: z.string().optional(),
    source: z.enum(["qr_scan", "manual"]).default("manual"),
    notes: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  })
  .refine((d) => d.ticketBookingId || d.visitorName || d.visitorEmail || d.visitorPhone, {
    message: "Provide a ticket to scan or at least one visitor contact detail",
  });

router.post("/", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "lead:capture");
  if (businessIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to capture leads" });
  }

  const parsed = captureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const participation = await prisma.exhibitionExhibitor.findFirst({
    where: { id: parsed.data.exhibitionExhibitorId, exhibitorBusinessId: { in: businessIds }, status: "confirmed" },
  });
  if (!participation) {
    return res.status(404).json({ error: "No confirmed participation found for this exhibitor at this exhibition" });
  }

  let visitorName = parsed.data.visitorName;
  let visitorEmail = parsed.data.visitorEmail;
  let visitorPhone = parsed.data.visitorPhone;

  if (parsed.data.ticketBookingId) {
    const ticketBooking = await prisma.ticketBooking.findFirst({
      where: { id: parsed.data.ticketBookingId, exhibitionId: participation.exhibitionId, paymentStatus: "paid" },
    });
    if (!ticketBooking) {
      return res.status(404).json({ error: "No paid ticket found for this exhibition with that code" });
    }
    visitorName = visitorName ?? ticketBooking.attendeeName ?? undefined;
    visitorEmail = visitorEmail ?? ticketBooking.attendeeEmail ?? undefined;
    visitorPhone = visitorPhone ?? ticketBooking.attendeePhone ?? undefined;
  }

  const lead = await prisma.lead.create({
    data: {
      exhibitionExhibitorId: participation.id,
      ticketBookingId: parsed.data.ticketBookingId,
      visitorName,
      visitorEmail,
      visitorPhone,
      source: parsed.data.source,
      notes: parsed.data.notes,
      priority: parsed.data.priority,
      capturedByUserId: req.user!.id,
    },
    include: leadInclude,
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "lead.captured",
    entityType: "Lead",
    entityId: lead.id,
    metadata: { exhibitionExhibitorId: participation.id, source: parsed.data.source },
  });

  res.status(201).json({ lead });
});

// -------- Update a lead: status, priority, notes, assignment, follow-up --------

const updateSchema = z.object({
  status: z.enum(["new", "contacted", "interested", "negotiation", "converted", "lost"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  notes: z.string().nullable().optional(),
  followUpDate: dateString.nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "lead:capture");
  const existing = businessIds.length
    ? await prisma.lead.findFirst({
        where: { id: req.params.id, exhibitionExhibitor: { exhibitorBusinessId: { in: businessIds } } },
        include: { exhibitionExhibitor: true },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Lead not found" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  if (parsed.data.assignedToUserId) {
    const member = await prisma.exhibitorMembership.findFirst({
      where: {
        userId: parsed.data.assignedToUserId,
        exhibitorBusinessId: existing.exhibitionExhibitor.exhibitorBusinessId,
        status: "active",
      },
    });
    if (!member) {
      return res.status(400).json({ error: "Can only assign leads to a member of this exhibitor business" });
    }
  }

  const lead = await prisma.lead.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      priority: parsed.data.priority,
      notes: parsed.data.notes === null ? null : parsed.data.notes,
      followUpDate: parsed.data.followUpDate === undefined ? undefined : parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null,
      assignedToUserId: parsed.data.assignedToUserId === undefined ? undefined : parsed.data.assignedToUserId,
    },
    include: leadInclude,
  });

  if (parsed.data.status && parsed.data.status !== existing.status) {
    await logAudit({
      actorUserId: req.user!.id,
      action: "lead.status_changed",
      entityType: "Lead",
      entityId: lead.id,
      metadata: { from: existing.status, to: parsed.data.status },
    });
  }
  if (parsed.data.assignedToUserId !== undefined && parsed.data.assignedToUserId !== existing.assignedToUserId) {
    await logAudit({
      actorUserId: req.user!.id,
      action: "lead.assigned",
      entityType: "Lead",
      entityId: lead.id,
      metadata: { assignedToUserId: parsed.data.assignedToUserId },
    });
  }

  res.json({ lead });
});

export default router;
