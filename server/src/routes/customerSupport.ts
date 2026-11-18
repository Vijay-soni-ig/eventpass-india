import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  getSupportTicketOwnerContexts,
  resolveSupportTicketOwnerContext,
  supportTicketOwnerWhere,
} from "../lib/supportOwnership";
import { requireAuth } from "../middleware/auth";
import { profileMutationRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth);

const SUPPORT_CATEGORIES = ["account", "exhibition", "exhibitor", "visitor", "payment", "subscription", "technical", "other"] as const;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

const ownerSelectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("organizer"), organizerId: z.string().trim().min(1).max(128) }).strict(),
  z.object({ type: z.literal("exhibitor"), exhibitorBusinessId: z.string().trim().min(1).max(128) }).strict(),
]);

const safeText = (value: string) =>
  ![...value].some((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  });

const createSchema = z.object({
  owner: ownerSelectionSchema,
  subject: z.string().trim().min(3).max(180).refine(safeText, "Subject contains unsupported characters"),
  description: z.string().trim().min(10).max(5000).refine(safeText, "Description contains unsupported characters"),
  category: z.enum(SUPPORT_CATEGORIES).default("other"),
}).strict();

const listSchema = z.object({
  owner: z.string().optional(),
  cursor: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
}).strict();

const replySchema = z.object({
  body: z.string().trim().min(1).max(5000).refine(safeText, "Message contains unsupported characters"),
}).strict();

function customerTicketWhere(owners: Awaited<ReturnType<typeof getSupportTicketOwnerContexts>>) {
  return {
    OR: owners.map((owner) => supportTicketOwnerWhere(owner)),
  };
}

function customerTicketSelect() {
  return {
    id: true,
    subject: true,
    category: true,
    priority: true,
    status: true,
    requesterName: true,
    createdAt: true,
    updatedAt: true,
    resolvedAt: true,
    organizer: { select: { id: true, name: true } },
    exhibitorBusiness: { select: { id: true, companyName: true } },
  } as const;
}

// Customer-facing routes are deliberately separate from /api/platform/support.
// Every ticket lookup includes the currently authorized tenant scope in SQL.
router.get("/", async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const allowedOwners = await getSupportTicketOwnerContexts(req.user!);
  if (allowedOwners.length === 0) return res.status(403).json({ error: "No support workspace access" });

  let owners = allowedOwners;
  if (parsed.data.owner) {
    let selection: z.infer<typeof ownerSelectionSchema>;
    try {
      selection = ownerSelectionSchema.parse(JSON.parse(parsed.data.owner));
    } catch {
      return res.status(400).json({ error: "Invalid owner selection" });
    }
    const resolved = await resolveSupportTicketOwnerContext(req.user!, selection);
    if (!resolved) return res.status(404).json({ error: "Support workspace not found" });
    owners = [resolved];
  }

  const where = customerTicketWhere(owners);
  if (parsed.data.cursor) {
    const cursorTicket = await prisma.supportTicket.findFirst({
      where: { id: parsed.data.cursor, ...where },
      select: { id: true },
    });
    if (!cursorTicket) return res.status(404).json({ error: "Support cursor not found" });
  }

  const tickets = await prisma.supportTicket.findMany({
    where,
    select: customerTicketSelect(),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: parsed.data.limit + 1,
    ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
  });
  const hasMore = tickets.length > parsed.data.limit;
  const page = hasMore ? tickets.slice(0, parsed.data.limit) : tickets;
  res.json({
    tickets: page,
    pageInfo: {
      hasMore,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
      pageSize: parsed.data.limit,
    },
  });
});

router.post("/", profileMutationRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const owner = await resolveSupportTicketOwnerContext(req.user!, parsed.data.owner);
  if (!owner) return res.status(404).json({ error: "Support workspace not found" });

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        subject: parsed.data.subject,
        category: parsed.data.category,
        priority: "medium",
        status: "open",
        requesterName: req.user!.fullName ?? req.user!.email,
        requesterEmail: req.user!.email,
        requesterUserId: req.user!.id,
        ...(owner.type === "organizer"
          ? { organizerId: owner.organizerId }
          : { exhibitorBusinessId: owner.exhibitorBusinessId }),
        messages: {
          create: {
            authorUserId: req.user!.id,
            body: parsed.data.description,
            isInternalNote: false,
          },
        },
      },
      select: {
        ...customerTicketSelect(),
        messages: {
          where: { isInternalNote: false },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            body: true,
            createdAt: true,
            authorUser: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: req.user!.id,
        action: "support.customer_ticket_created",
        entityType: "SupportTicket",
        entityId: created.id,
        metadata: { category: created.category, ownerType: owner.type },
      },
    });
    return created;
  });

  res.status(201).json({ ticket });
});

router.get("/:id", async (req, res) => {
  const owners = await getSupportTicketOwnerContexts(req.user!);
  if (owners.length === 0) return res.status(403).json({ error: "No support workspace access" });

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, ...customerTicketWhere(owners) },
    select: {
      ...customerTicketSelect(),
      messages: {
        where: { isInternalNote: false },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorUser: { select: { id: true, fullName: true } },
        },
      },
    },
  });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json({ ticket });
});

router.post("/:id/messages", profileMutationRateLimit, async (req, res) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const owners = await getSupportTicketOwnerContexts(req.user!);
  if (owners.length === 0) return res.status(403).json({ error: "No support workspace access" });

  const where = { id: req.params.id, ...customerTicketWhere(owners) };
  const ticket = await prisma.supportTicket.findFirst({
    where,
    select: { id: true, status: true, organizerId: true, exhibitorBusinessId: true },
  });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  if (ticket.status === "closed") {
    return res.status(409).json({ error: "This ticket is closed and cannot receive new replies" });
  }

  const nextStatus = ticket.status === "resolved" ? "open" : ticket.status === "waiting_customer" ? "in_progress" : ticket.status;
  let result: {
    message: { id: string; body: string; createdAt: Date; authorUser: { id: string; fullName: string | null } | null };
    ticket: { id: string; status: string; updatedAt: Date };
  };
  try {
    result = await prisma.$transaction(async (tx) => {
      const message = await tx.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          authorUserId: req.user!.id,
          body: parsed.data.body,
          isInternalNote: false,
        },
        select: {
          id: true,
          body: true,
          createdAt: true,
          authorUser: { select: { id: true, fullName: true } },
        },
      });
      // The ticket was fetched with the caller's tenant predicate immediately
      // before entering this transaction. Use Prisma's extended unique filter
      // to atomically reject a close/reply race without comparing nullable owner
      // columns (which caused updateMany to report zero rows for valid tickets).
      // Ticket ownership is not mutable through customer support APIs.
      let updatedTicket: { id: string; status: string; updatedAt: Date };
      try {
        updatedTicket = await tx.supportTicket.update({
          where: {
            id: ticket.id,
            status: { not: "closed" },
          },
          data: {
            ...(nextStatus !== ticket.status ? { status: nextStatus } : {}),
            ...(ticket.status === "resolved" ? { resolvedAt: null } : {}),
          },
          select: { id: true, status: true, updatedAt: true },
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2025"
        ) {
          throw new Error("CUSTOMER_SUPPORT_TICKET_CLOSED");
        }
        throw error;
      }
      await tx.auditLog.create({
        data: {
          actorUserId: req.user!.id,
          action: "support.customer_ticket_replied",
          entityType: "SupportTicket",
          entityId: ticket.id,
          metadata: { statusChanged: nextStatus !== ticket.status, previousStatus: ticket.status, newStatus: updatedTicket.status },
        },
      });
      return { message, ticket: updatedTicket };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_SUPPORT_TICKET_CLOSED") {
      return res.status(409).json({ error: "This ticket was closed while the reply was being submitted" });
    }
    throw error;
  }

  res.status(201).json(result);
});

export default router;
