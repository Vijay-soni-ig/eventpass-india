import { Router } from "express";
import { z } from "zod";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

// ---------------------------------------------------------------------------
// Phase 21C (P1-2 fix) — organizer-scoped lead list/detail/export.
//
// Mirrors routes/leads.ts's own list/export shape (same query filters, same
// CSV column layout) but scoped by organizerIdsWithPermission instead of
// exhibitorBusinessIdsWithPermission — a full lead list was previously only
// available exhibitor-side; the organizer surface was analytics-only. The
// exhibitor lead-isolation model in leads.ts is completely untouched: an
// exhibitor's own lead:view/lead:export still only ever sees their own
// business's leads, and this router can never be reached without an
// organizer:analytics-equivalent scope.
// ---------------------------------------------------------------------------

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
  exhibitorBusinessId: z.string().optional(),
});

async function buildOrganizerScopedWhere(user: User, permission: "lead:view" | "lead:export", query: unknown) {
  const organizerIds = await organizerIdsWithPermission(user, permission);
  const parsed = listQuerySchema.safeParse(query);
  const filters = parsed.success ? parsed.data : {};

  const where: Prisma.LeadWhereInput = {
    exhibitionExhibitor: {
      exhibition: { organizerId: { in: organizerIds } },
      ...(filters.exhibitionId ? { exhibitionId: filters.exhibitionId } : {}),
      ...(filters.exhibitorBusinessId ? { exhibitorBusinessId: filters.exhibitorBusinessId } : {}),
    },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
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
  return { where, organizerIds };
}

router.get("/", async (req, res) => {
  const { where, organizerIds } = await buildOrganizerScopedWhere(req.user!, "lead:view", req.query);
  if (organizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to view leads" });
  }
  const leads = await prisma.lead.findMany({ where, include: leadInclude, orderBy: { createdAt: "desc" } });
  res.json({ leads });
});

router.get("/export", async (req, res) => {
  const exportIds = await organizerIdsWithPermission(req.user!, "lead:export");
  if (exportIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to export leads" });
  }
  const { where } = await buildOrganizerScopedWhere(req.user!, "lead:export", req.query);
  const leads = await prisma.lead.findMany({ where, include: leadInclude, orderBy: { createdAt: "desc" } });

  const header = ["Name", "Email", "Phone", "Exhibition", "Exhibitor Business", "Status", "Priority", "Assigned To", "Follow-up Date", "Notes", "Captured At"];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = leads.map((l) =>
    [
      l.visitorName ?? l.ticketBooking?.attendeeName ?? "",
      l.visitorEmail ?? l.ticketBooking?.attendeeEmail ?? "",
      l.visitorPhone ?? l.ticketBooking?.attendeePhone ?? "",
      l.exhibitionExhibitor.exhibition.name,
      l.exhibitionExhibitor.business.companyName ?? "",
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

  await logAudit({ actorUserId: req.user!.id, action: "lead.exported_by_organizer", entityType: "Lead", metadata: { count: leads.length } });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="leads-${Date.now()}.csv"`);
  res.send(csv);
});

// Aggregate lead analytics across every exhibition the caller's organizer
// runs — never a single exhibitor's lead details (that stays exhibitor-only
// via /api/leads). Scoped strictly to organizers the caller has
// lead:analytics on; an exhibitionId filter narrows further but can never
// widen past that tenant boundary.
router.get("/analytics", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "lead:analytics");
  if (organizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to view lead analytics" });
  }

  const exhibitionId = req.query.exhibitionId as string | undefined;
  const exhibitionScope = {
    organizerId: { in: organizerIds },
    ...(exhibitionId ? { id: exhibitionId } : {}),
  };

  const leads = await prisma.lead.findMany({
    where: { exhibitionExhibitor: { exhibition: exhibitionScope } },
    select: {
      status: true,
      capturedAt: true,
      exhibitionExhibitor: {
        select: {
          exhibitionId: true,
          exhibition: { select: { name: true } },
          exhibitorBusinessId: true,
          business: { select: { companyName: true } },
        },
      },
    },
  });

  const totalLeads = leads.length;

  const byStatus: Record<string, number> = {};
  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
  }

  const byExhibitorMap = new Map<string, { exhibitorBusinessId: string; name: string; count: number; converted: number }>();
  for (const lead of leads) {
    const key = lead.exhibitionExhibitor.exhibitorBusinessId;
    const entry = byExhibitorMap.get(key) ?? {
      exhibitorBusinessId: key,
      name: lead.exhibitionExhibitor.business.companyName ?? "Unnamed business",
      count: 0,
      converted: 0,
    };
    entry.count += 1;
    if (lead.status === "converted") entry.converted += 1;
    byExhibitorMap.set(key, entry);
  }
  const byExhibitor = Array.from(byExhibitorMap.values()).sort((a, b) => b.count - a.count);

  const byDayMap = new Map<string, number>();
  for (const lead of leads) {
    const day = lead.capturedAt.toISOString().slice(0, 10);
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
  }
  const byDay = Array.from(byDayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const converted = byStatus["converted"] ?? 0;
  const lost = byStatus["lost"] ?? 0;
  const closed = converted + lost;
  const conversionRate = closed > 0 ? converted / closed : 0;

  res.json({
    totalLeads,
    byStatus,
    byExhibitor,
    byDay,
    conversionRate,
  });
});

// Registered LAST — a param route must never precede /export or /analytics,
// or it would swallow those literal paths as an ":id" value.
router.get("/:id", async (req, res) => {
  const { where } = await buildOrganizerScopedWhere(req.user!, "lead:view", req.query);
  const lead = await prisma.lead.findFirst({ where: { ...where, id: req.params.id }, include: leadInclude });
  if (!lead) return res.status(404).json({ error: "Lead not found" });
  res.json({ lead });
});

export default router;
