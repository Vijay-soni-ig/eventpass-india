import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";
import { getExhibitorAnalytics } from "../lib/analyticsService";
import type { Prisma, User } from "@prisma/client";
import { dateString } from "../lib/validation";
import { leadMutationRateLimit } from "../middleware/rateLimit";
import { resolveActiveBusinessSelection } from "../lib/exhibitorBusinessSelection";
import { escapeCsvCell } from "../lib/csv";
import { can, exhibitorRoleToRole } from "../lib/permissions";
import { isPlatformAdmin } from "../lib/access";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

type LeadWritePermission = "lead:capture" | "lead:manage";

/**
 * Serialize exhibitor lead writes against membership changes. Membership
 * mutation routes take this same business-row lock before changing roles or
 * status, so authorization is re-read immediately before the lead mutation.
 */
async function withExhibitorLeadPermission<T>(
  user: User,
  businessId: string,
  permission: LeadWritePermission,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${businessId} FOR UPDATE`;

    if (!isPlatformAdmin(user)) {
      const membership = await tx.exhibitorMembership.findFirst({
        where: {
          exhibitorBusinessId: businessId,
          userId: user.id,
          status: "active",
          business: { suspended: false },
        },
        select: { role: true },
      });
      if (!membership || !can(exhibitorRoleToRole(membership.role), permission)) return null;
    }

    return operation(tx);
  });
}

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
  if (!parsed.success) {
    return { valid: false as const, businessIds, validationError: parsed.error.issues[0].message };
  }
  const filters = parsed.data;

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
  return { valid: true as const, where, businessIds };
}

router.get("/", async (req, res) => {
  const scope = await buildScopedWhere(req.user!, "lead:view", req.query);
  if (!scope.valid) return res.status(400).json({ error: scope.validationError });
  const { where, businessIds } = scope;
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
  const scope = await buildScopedWhere(req.user!, "lead:export", req.query);
  if (!scope.valid) return res.status(400).json({ error: scope.validationError });
  const { where } = scope;
  const leads = await prisma.lead.findMany({ where, include: leadInclude, orderBy: { createdAt: "desc" } });

  const header = ["Name", "Email", "Phone", "Exhibition", "Status", "Priority", "Assigned To", "Follow-up Date", "Notes", "Captured At"];
  const escape = escapeCsvCell;
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
  const selection = resolveActiveBusinessSelection(
    businessIds,
    req.get("X-Exhibitor-Business-Id")?.trim()
  );
  if ("error" in selection) return res.status(selection.status).json({ error: selection.error });

  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  // Keep analytics aligned with the explicitly selected exhibitor business.
  // The selection helper preserves single-business compatibility and rejects
  // ambiguous or unauthorized multi-business selections.
  if (!selection.businessId) {
    return res.status(403).json({ error: "You do not have permission to view lead analytics" });
  }
  const analytics = await getExhibitorAnalytics(selection.businessId, {
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
  });
  res.json(analytics);
});

router.get("/:id", async (req, res) => {
  const scope = await buildScopedWhere(req.user!, "lead:view", req.query);
  if (!scope.valid) return res.status(400).json({ error: scope.validationError });
  const { where } = scope;
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

router.post("/", leadMutationRateLimit, async (req, res) => {
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

  const leadData = {
    exhibitionExhibitorId: participation.id,
    ticketBookingId: parsed.data.ticketBookingId,
    visitorName,
    visitorEmail,
    visitorPhone,
    source: parsed.data.source,
    notes: parsed.data.notes,
    priority: parsed.data.priority,
    capturedByUserId: req.user!.id,
  };

  // Revalidate both the caller's membership and the participation inside
  // the same transaction as the write. Ticket-linked captures retain their
  // advisory lock so concurrent scans still produce at most one lead.
  const captureResult = await withExhibitorLeadPermission(
    req.user!,
    participation.exhibitorBusinessId,
    "lead:capture",
    async (tx) => {
      const currentParticipation = await tx.exhibitionExhibitor.findFirst({
        where: {
          id: participation.id,
          exhibitorBusinessId: participation.exhibitorBusinessId,
          status: "confirmed",
        },
        select: { id: true },
      });
      if (!currentParticipation) return { kind: "not_found" as const };

      if (parsed.data.ticketBookingId) {
        await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${participation.id}), hashtext(${parsed.data.ticketBookingId!}))`;
        const currentBooking = await tx.ticketBooking.findFirst({
          where: {
            id: parsed.data.ticketBookingId,
            exhibitionId: participation.exhibitionId,
            paymentStatus: "paid",
          },
          select: { id: true },
        });
        if (!currentBooking) return { kind: "not_found" as const };
        const existingLead = await tx.lead.findFirst({
          where: {
            exhibitionExhibitorId: participation.id,
            ticketBookingId: parsed.data.ticketBookingId,
          },
          include: leadInclude,
        });
        if (existingLead) return { kind: "duplicate" as const };
      }

      const lead = await tx.lead.create({ data: leadData, include: leadInclude });
      return { kind: "created" as const, lead };
    },
  );

  if (!captureResult) {
    return res.status(404).json({ error: "Exhibitor business access changed. Refresh and try again." });
  }
  if (captureResult.kind === "not_found") {
    return res.status(404).json({ error: "Confirmed participation or paid ticket not found" });
  }
  if (captureResult.kind === "duplicate") {
    return res.status(409).json({
      error: "This visitor's ticket has already been captured as a lead for this exhibition",
    });
  }
  const lead = captureResult.lead;

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

router.patch("/:id", leadMutationRateLimit, async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "lead:manage");
  const existing = businessIds.length
    ? await prisma.lead.findFirst({
        where: { id: req.params.id, exhibitionExhibitor: { exhibitorBusinessId: { in: businessIds } } },
        include: { exhibitionExhibitor: true },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Lead not found" });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const businessId = existing.exhibitionExhibitor.exhibitorBusinessId;
  const updateResult = await withExhibitorLeadPermission(
    req.user!,
    businessId,
    "lead:manage",
    async (tx) => {
      const current = await tx.lead.findFirst({
        where: { id: existing.id, exhibitionExhibitor: { exhibitorBusinessId: businessId } },
        include: { exhibitionExhibitor: true },
      });
      if (!current) return { kind: "not_found" as const };

      if (parsed.data.assignedToUserId) {
        const member = await tx.exhibitorMembership.findFirst({
          where: {
            userId: parsed.data.assignedToUserId,
            exhibitorBusinessId: businessId,
            status: "active",
            business: { suspended: false },
          },
          select: { id: true },
        });
        if (!member) return { kind: "invalid_assignee" as const };
      }

      const lead = await tx.lead.update({
        where: { id: current.id },
        data: {
          status: parsed.data.status,
          priority: parsed.data.priority,
          notes: parsed.data.notes === null ? null : parsed.data.notes,
          followUpDate: parsed.data.followUpDate === undefined ? undefined : parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null,
          assignedToUserId: parsed.data.assignedToUserId === undefined ? undefined : parsed.data.assignedToUserId,
        },
        include: leadInclude,
      });
      return { kind: "updated" as const, lead, current };
    },
  );

  if (!updateResult || updateResult.kind === "not_found") {
    return res.status(404).json({ error: "Lead not found" });
  }
  if (updateResult.kind === "invalid_assignee") {
    return res.status(400).json({ error: "Can only assign leads to an active member of this exhibitor business" });
  }
  const { lead } = updateResult;

  if (parsed.data.status && parsed.data.status !== updateResult.current.status) {
    await logAudit({
      actorUserId: req.user!.id,
      action: "lead.status_changed",
      entityType: "Lead",
      entityId: lead.id,
      metadata: { from: updateResult.current.status, to: parsed.data.status },
    });
  }
  if (parsed.data.assignedToUserId !== undefined && parsed.data.assignedToUserId !== updateResult.current.assignedToUserId) {
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
