import { Router } from "express";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { eventMutationRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { dateString } from "../lib/validation";
import { logAudit } from "../lib/audit";
import { EVENT_MODULE_VALUES, validateModuleConfig } from "../lib/eventModules";

const router = Router();

// ETX-EVENT-001C — genuinely independent, non-Exhibition Events only.
// Organizer-scoped throughout: no bootstrap exemption (unlike
// POST /api/exhibitions) — a caller must already have an organizer
// membership with event:create before creating anything here. See
// docs/product/UNIVERSAL_EVENT_FOUNDATION.md and the ETX-EVENT-001C impact
// report for why EXHIBITION-typed Events are never created through this
// router.
router.use(requireAuth, requireOrganizerAccess);

const EVENT_TYPE_VALUES = ["EXHIBITION", "CONFERENCE", "WORKSHOP", "SEMINAR", "CONCERT", "FESTIVAL", "SPORTS", "COMMUNITY", "OTHER"] as const;
const EVENT_STATUS_VALUES = ["DRAFT", "PUBLISHED", "PAUSED", "COMPLETED", "CANCELLED"] as const;
const SORT_VALUES = ["createdAt_desc", "createdAt_asc", "startDate_asc", "startDate_desc", "title_asc", "title_desc"] as const;

const SORT_TO_ORDER_BY: Record<(typeof SORT_VALUES)[number], { [key: string]: "asc" | "desc" }> = {
  createdAt_desc: { createdAt: "desc" },
  createdAt_asc: { createdAt: "asc" },
  startDate_asc: { startDate: "asc" },
  startDate_desc: { startDate: "desc" },
  title_asc: { title: "asc" },
  title_desc: { title: "desc" },
};

// Fields mirrored from a linked Exhibition (see lib/eventMapping.ts). Once an
// Event is linked, PATCH must never become a second, uncontrolled write path
// for these — the Exhibition endpoint is the source of truth for all of them.
const MIRRORED_FIELD_KEYS = [
  "title", "description", "categoryId", "category", "status", "visibility",
  "startDate", "endDate", "venue", "city", "latitude", "longitude",
  "coverImageUrl", "refundPolicy", "terms",
] as const;

const LIST_PAGE_SIZE_MAX = 100;

class EventPublishReadinessError extends Error {
  constructor(public missing: string[]) {
    super(`Cannot publish — missing: ${missing.join(", ")}`);
  }
}

function assertEventPublishReady(fields: {
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  venue: string | null;
  city: string | null;
}): void {
  const missing: string[] = [];
  if (!fields.title.trim()) missing.push("event title");
  if (!fields.startDate) missing.push("start date");
  if (!fields.endDate) missing.push("end date");
  if (!fields.venue?.trim()) missing.push("venue");
  if (!fields.city?.trim()) missing.push("city");
  if (missing.length > 0) throw new EventPublishReadinessError(missing);
}

function sendEventPublishReadinessError(res: import("express").Response, err: EventPublishReadinessError) {
  return res.status(400).json({ error: err.message, missing: err.missing });
}
const LIST_PAGE_SIZE_DEFAULT = 20;

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  organizerId: z.string().optional(),
  eventType: z.enum(EVENT_TYPE_VALUES).optional(),
  status: z.enum(EVENT_STATUS_VALUES).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  categoryId: z.string().optional(),
  city: z.string().trim().max(100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  archived: z.coerce.boolean().optional(),
  sort: z.enum(SORT_VALUES).default("createdAt_desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(LIST_PAGE_SIZE_DEFAULT),
});

router.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { search, organizerId, eventType, status, visibility, categoryId, city, dateFrom, dateTo, archived, sort, page, limit } = parsed.data;

  const permittedOrganizerIds = await organizerIdsWithPermission(req.user!, "event:view");
  if (permittedOrganizerIds.length === 0) {
    return res.json({ events: [], total: 0, page, pageSize: limit });
  }

  // A caller can never escape their permitted organizer scope by supplying
  // an organizerId query param: if it isn't one they're permitted to see,
  // the effective filter becomes "no organizer", i.e. zero results — never
  // an error that would confirm or deny whether that organizerId exists.
  const effectiveOrganizerIds = organizerId
    ? (permittedOrganizerIds.includes(organizerId) ? [organizerId] : [])
    : permittedOrganizerIds;

  const where = {
    organizerId: { in: effectiveOrganizerIds },
    ...(eventType ? { eventType } : {}),
    ...(status ? { status } : {}),
    ...(visibility ? { visibility } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" as const } } : {}),
    ...(dateFrom ? { startDate: { gte: new Date(dateFrom) } } : {}),
    ...(dateTo ? { endDate: { lte: new Date(dateTo) } } : {}),
    archivedAt: archived ? { not: null } : null,
  };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: { category: true },
      orderBy: SORT_TO_ORDER_BY[sort],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.event.count({ where }),
  ]);

  res.json({ events, total, page, pageSize: limit });
});

async function loadAuthorizedEvent(eventId: string, req: import("express").Request, permission: "event:view" | "event:update" | "event:delete") {
  const permittedOrganizerIds = await organizerIdsWithPermission(req.user!, permission);
  if (permittedOrganizerIds.length === 0) return null;
  // Never authorize an Event solely by id — always intersected with the
  // caller's permitted organizer set, exactly like every existing
  // Exhibition route's loadWithPermission (routes/exhibitions.ts).
  return prisma.event.findFirst({
    where: { id: eventId, organizerId: { in: permittedOrganizerIds } },
    include: { category: true, moduleEnablements: true, exhibition: { select: { id: true } } },
  });
}

router.get("/:id", async (req, res) => {
  const event = await loadAuthorizedEvent(req.params.id, req, "event:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  res.json({ event });
});

const createEventSchema = z.object({
  eventType: z.enum(EVENT_TYPE_VALUES),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(EVENT_STATUS_VALUES).default("DRAFT"),
  visibility: z.enum(["public", "private"]).default("public"),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  timezone: z.string().optional(),
  venue: z.string().optional(),
  city: z.string().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  coverImageUrl: z.string().optional(),
  refundPolicy: z.string().optional(),
  terms: z.string().optional(),
  modules: z.array(z.enum(EVENT_MODULE_VALUES)).optional().refine((values) => values === undefined || new Set(values).size === values.length, { message: "modules must not contain duplicates" }),
});

class InvalidDateOrderError extends Error {
  constructor() {
    super("End date cannot be before start date");
  }
}

function assertValidDateOrder(startDate: Date | null, endDate: Date | null): void {
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new InvalidDateOrderError();
  }
}

async function resolveCanonicalCategoryId(
  tx: PrismaClient | Prisma.TransactionClient,
  categoryId: string | undefined,
  categoryName: string | undefined,
): Promise<string | null> {
  if (categoryId !== undefined) {
    if (categoryId === "") return null;
    const category = await tx.eventCategory.findFirst({
      where: { id: categoryId, active: true },
      select: { id: true },
    });
    if (!category) throw new Error("categoryId must reference an active Event Category");
    return category.id;
  }

  if (categoryName !== undefined) {
    const normalized = categoryName.trim();
    if (!normalized) return null;
    const category = await tx.eventCategory.findFirst({
      where: {
        active: true,
        OR: [
          { slug: normalized.toLowerCase() },
          { name: { equals: normalized, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (!category) throw new Error("category must match an existing active Event Category");
    return category.id;
  }

  return null;
}

router.post("/", eventMutationRateLimit, async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { eventType, category, categoryId, modules, startDate, endDate, ...rest } = parsed.data;

  // ETX-EVENT-001C's critical architecture rule: POST /api/exhibitions
  // remains the only creation path for eventType EXHIBITION — it carries
  // entitlement checks, publish-readiness validation, nested ticket
  // type/stall creation, and audit/notification behavior this route
  // deliberately does not (and must not) reimplement.
  if (eventType === "EXHIBITION") {
    return res.status(400).json({
      error: "Cannot create an EXHIBITION-typed Event directly. Use POST /api/exhibitions instead — its paired Event is created automatically.",
    });
  }

  const resolvedStartDate = startDate ? new Date(startDate) : null;
  const resolvedEndDate = endDate ? new Date(endDate) : null;
  try {
    assertValidDateOrder(resolvedStartDate, resolvedEndDate);
  } catch (err) {
    if (err instanceof InvalidDateOrderError) return res.status(400).json({ error: err.message });
    throw err;
  }

  // No first-organizer bootstrap exemption here, deliberately: unlike
  // POST /api/exhibitions, a caller must already belong to an organizer
  // with event:create — see this file's top-of-file note.
  const creatableOrganizerIds = await organizerIdsWithPermission(req.user!, "event:create");
  if (creatableOrganizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to create events" });
  }
  const organizerId = creatableOrganizerIds[0];

  if (categoryId && !categoryId.trim()) return res.status(400).json({ error: "categoryId must not be empty" });

  let resolvedCategoryId: string | null = null;
  let event;
  try {
    event = await prisma.$transaction(async (tx) => {
      resolvedCategoryId = await resolveCanonicalCategoryId(tx, categoryId, category);
      const created = await tx.event.create({
      data: {
        ...rest,
        eventType,
        organizerId,
        ownerId: req.user!.id,
        categoryId: resolvedCategoryId,
        startDate: resolvedStartDate,
        endDate: resolvedEndDate,
      },
    });
    const defaultModules: EventModule[] = [
      "REGISTRATION", "TICKETING", "EXHIBITORS", "STALL_BOOKING",
      "FLOOR_PLAN", "CHECK_IN", "LEADS", "ANALYTICS",
      "SPEAKERS", "SPONSORS", "PARTNERS", "VENDORS",
    ];
    if (eventType === "EXHIBITION") defaultModules.unshift("EXHIBITION");
    const moduleTypes = modules === undefined ? defaultModules : modules;
    if (moduleTypes.length > 0) {
      await tx.eventModuleEnablement.createMany({
        data: moduleTypes.map((moduleType) => ({ eventId: created.id, moduleType })),
      });
    }
      return tx.event.findUniqueOrThrow({ where: { id: created.id }, include: { category: true, moduleEnablements: true } });
    });
  } catch (err) {
    if (err instanceof Error && /active Event Category|existing active Event Category/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }

  await logAudit({
    actorUserId: req.user!.id,
    action: "event.created",
    entityType: "Event",
    entityId: event.id,
    metadata: { organizerId, title: event.title, eventType: event.eventType, status: event.status },
  });

  res.status(201).json({ event });
});

const updateEventSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string(),
    categoryId: z.string().nullable(),
    status: z.enum(EVENT_STATUS_VALUES),
    visibility: z.enum(["public", "private"]),
    startDate: dateString,
    endDate: dateString,
    timezone: z.string(),
    venue: z.string(),
    city: z.string(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    coverImageUrl: z.string(),
    refundPolicy: z.string(),
    terms: z.string(),
    slug: z.string().nullable(),
  })
  .partial();

router.patch("/:id", eventMutationRateLimit, async (req, res) => {
  const existing = await loadAuthorizedEvent(req.params.id, req, "event:update");
  if (!existing) return res.status(404).json({ error: "Event not found" });
  if (existing.archivedAt) return res.status(409).json({ error: "This event is archived. Restore it before making changes." });

  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  // ETX-EVENT-001C: for an Event linked to an Exhibition, this route must
  // never become a second, uncontrolled write path for the fields the
  // Exhibition endpoint already owns — reject outright rather than
  // silently accepting a write that a later Exhibition update would just
  // overwrite again (the exact dual-source-of-truth risk this migration
  // is designed to avoid).
  if (existing.exhibition) {
    const attemptedMirroredKeys = Object.keys(req.body ?? {}).filter((key) => (MIRRORED_FIELD_KEYS as readonly string[]).includes(key));
    if (attemptedMirroredKeys.length > 0) {
      return res.status(400).json({
        error: `This Event is linked to an Exhibition. Update these fields via PUT /api/exhibitions/:id instead: ${attemptedMirroredKeys.join(", ")}`,
        mirroredFields: attemptedMirroredKeys,
      });
    }
  }

  const { category, categoryId, startDate, endDate, ...rest } = parsed.data;
  const resolvedStartDate = startDate ? new Date(startDate) : undefined;
  const resolvedEndDate = endDate ? new Date(endDate) : undefined;
  const finalStartDate = resolvedStartDate ?? existing.startDate;
  const finalEndDate = resolvedEndDate ?? existing.endDate;
  try {
    assertValidDateOrder(finalStartDate, finalEndDate);
  } catch (err) {
    if (err instanceof InvalidDateOrderError) return res.status(400).json({ error: err.message });
    throw err;
  }

  let resolvedCategoryId: string | null | undefined = undefined;
  if (categoryId !== undefined || category !== undefined) {
    try {
      resolvedCategoryId = await resolveCanonicalCategoryId(prisma, categoryId ?? undefined, category);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid Event Category" });
    }
  }

  const event = await prisma.$transaction(async (tx) => {
    return tx.event.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(resolvedCategoryId !== undefined ? { categoryId: resolvedCategoryId } : {}),
        startDate: resolvedStartDate,
        endDate: resolvedEndDate,
      },
      include: { category: true, moduleEnablements: true },
    });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "event.updated",
    entityType: "Event",
    entityId: event.id,
    metadata: { changedFields: Object.keys(rest) },
  });

  res.json({ event });
});


// Publish an Event through an explicit, server-authoritative transition.
// This keeps publishing distinct from generic edits and gives the UI a
// stable endpoint for a readiness checklist.
router.post("/:id/publish", eventMutationRateLimit, async (req, res) => {
  const existing = await loadAuthorizedEvent(req.params.id, req, "event:update");
  if (!existing) return res.status(404).json({ error: "Event not found" });
  if (existing.archivedAt) return res.status(409).json({ error: "This event is archived. Restore it before publishing." });
  if (existing.status === "CANCELLED") return res.status(409).json({ error: "Cancelled events cannot be published." });
  if (existing.status === "PUBLISHED") return res.json({ event: existing });

  try {
    assertEventPublishReady({
      title: existing.title,
      startDate: existing.startDate,
      endDate: existing.endDate,
      venue: existing.venue,
      city: existing.city,
    });
  } catch (err) {
    if (err instanceof EventPublishReadinessError) return sendEventPublishReadinessError(res, err);
    throw err;
  }

  const event = await prisma.event.update({
    where: { id: existing.id },
    data: { status: "PUBLISHED", visibility: "public" },
    include: { category: true, moduleEnablements: true, exhibition: { select: { id: true } } },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "event.published",
    entityType: "Event",
    entityId: event.id,
    metadata: { statusBefore: existing.status, visibilityBefore: existing.visibility },
  });

  res.json({ event });
});

router.delete("/:id", eventMutationRateLimit, async (req, res) => {
  const existing = await loadAuthorizedEvent(req.params.id, req, "event:delete");
  if (!existing) return res.status(404).json({ error: "Event not found" });
  if (existing.archivedAt) return res.status(204).send();

  await prisma.event.update({ where: { id: existing.id }, data: { archivedAt: new Date() } });

  await logAudit({
    actorUserId: req.user!.id,
    action: "event.archived",
    entityType: "Event",
    entityId: existing.id,
    metadata: {},
  });

  res.status(204).send();
});

router.post("/:id/restore", eventMutationRateLimit, async (req, res) => {
  const existing = await loadAuthorizedEvent(req.params.id, req, "event:delete");
  if (!existing) return res.status(404).json({ error: "Event not found" });
  if (!existing.archivedAt) return res.status(400).json({ error: "This event is not archived" });

  const event = await prisma.event.update({
    where: { id: existing.id },
    data: { archivedAt: null },
    include: { category: true, moduleEnablements: true },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "event.restored",
    entityType: "Event",
    entityId: event.id,
    metadata: {},
  });

  res.json({ event });
});

router.get("/:id/modules", async (req, res) => {
  const existing = await loadAuthorizedEvent(req.params.id, req, "event:view");
  if (!existing) return res.status(404).json({ error: "Event not found" });
  const modules = await prisma.eventModuleEnablement.findMany({ where: { eventId: existing.id } });
  res.json({ modules });
});

const setModuleSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()).optional(),
});

router.put("/:id/modules/:moduleType", eventMutationRateLimit, async (req, res) => {
  const moduleTypeParam = req.params.moduleType;
  if (!(EVENT_MODULE_VALUES as readonly string[]).includes(moduleTypeParam)) {
    return res.status(400).json({ error: "Invalid module type" });
  }
  const moduleType = moduleTypeParam as (typeof EVENT_MODULE_VALUES)[number];

  const existing = await loadAuthorizedEvent(req.params.id, req, "event:update");
  if (!existing) return res.status(404).json({ error: "Event not found" });
  if (existing.archivedAt) return res.status(409).json({ error: "This event is archived. Restore it before making changes." });

  const parsed = setModuleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const configResult = validateModuleConfig(moduleType, parsed.data.config);
  if (!configResult.success) {
    return res.status(400).json({ error: `Invalid configuration for module ${moduleType}: ${configResult.error.issues[0].message}` });
  }

  if (moduleType === "EXHIBITION" && existing.eventType !== "EXHIBITION" && parsed.data.enabled) {
    return res.status(400).json({ error: "The EXHIBITION module is only valid for EXHIBITION events" });
  }

  const legacyExhibitionModules = new Set([
    "EXHIBITION", "TICKETING", "EXHIBITORS", "STALL_BOOKING",
    "FLOOR_PLAN", "LEADS", "CHECK_IN", "ANALYTICS",
  ]);
  if (existing.exhibition && !parsed.data.enabled && legacyExhibitionModules.has(moduleType)) {
    return res.status(409).json({
      error: `${moduleType} is required for the legacy Exhibition workflow and cannot be disabled until its operational API is migrated`,
    });
  }

  const enablement = await prisma.eventModuleEnablement.upsert({
    where: { eventId_moduleType: { eventId: existing.id, moduleType } },
    update: { enabled: parsed.data.enabled, config: configResult.data },
    create: { eventId: existing.id, moduleType, enabled: parsed.data.enabled, config: configResult.data },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.enabled ? "eventModule.enabled" : "eventModule.disabled",
    entityType: "EventModuleEnablement",
    entityId: enablement.id,
    metadata: { eventId: existing.id, moduleType },
  });

  res.json({ module: enablement });
});

export default router;
