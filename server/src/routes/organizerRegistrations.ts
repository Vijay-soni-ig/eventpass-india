import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";
import { profileMutationRateLimit } from "../middleware/rateLimit";
import { enqueueRegistrationNotification } from "../lib/registrationNotificationService";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);

const settingsSchema = z.object({
  enabled: z.boolean(),
  capacity: z.number().int().min(1).nullable(),
  requiresApproval: z.boolean(),
});

async function loadEvent(eventId: string, req: import("express").Request, permission: "registration:view" | "registration:manage") {
  const organizerIds = await organizerIdsWithPermission(req.user!, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({
    where: { id: eventId, organizerId: { in: organizerIds } },
    select: { id: true, organizerId: true, title: true, archivedAt: true },
  });
}

router.get("/settings/:eventId", async (req, res) => {
  const event = await loadEvent(req.params.eventId, req, "registration:view");
  if (!event) return res.status(404).json({ error: "Event not found" });
  const settings = await prisma.eventRegistrationSettings.findUnique({ where: { eventId: event.id } });
  return res.json({
    settings: settings ?? { eventId: event.id, enabled: true, capacity: null, requiresApproval: false },
  });
});

router.put("/settings/:eventId", profileMutationRateLimit, async (req, res) => {
  const event = await loadEvent(req.params.eventId, req, "registration:manage");
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.archivedAt) return res.status(409).json({ error: "Archived events cannot change registration settings" });

  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const settings = await prisma.eventRegistrationSettings.upsert({
    where: { eventId: event.id },
    update: parsed.data,
    create: { eventId: event.id, ...parsed.data },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventRegistration.settingsUpdated",
    entityType: "EventRegistrationSettings",
    entityId: settings.id,
    metadata: { eventId: event.id, ...parsed.data },
  });

  return res.json({ settings });
});

const listSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get("/", async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { eventId, status, search, page, limit } = parsed.data;

  const event = await loadEvent(eventId, req, "registration:view");
  if (!event) return res.status(404).json({ error: "Event not found" });

  const where = {
    eventId,
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { fullName: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
        { companyName: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [registrations, total] = await Promise.all([
    prisma.eventRegistration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.eventRegistration.count({ where }),
  ]);

  return res.json({ registrations, total, page, pageSize: limit });
});

const statusSchema = z.object({
  status: z.enum(["CONFIRMED", "CANCELLED"]),
  cancellationReason: z.string().trim().max(500).optional(),
});

router.patch("/:id/status", profileMutationRateLimit, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: req.params.id },
    select: { id: true, eventId: true, status: true, fullName: true, userId: true, email: true },
  });
  if (!registration) return res.status(404).json({ error: "Registration not found" });

  const event = await loadEvent(registration.eventId, req, "registration:manage");
  if (!event) return res.status(404).json({ error: "Registration not found" });

  if (registration.status === "CANCELLED") return res.status(409).json({ error: "Cancelled registrations cannot be changed" });
  if (registration.status === parsed.data.status) return res.json({ registration });

  if (parsed.data.status === "CANCELLED") {
    const updated = await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: parsed.data.cancellationReason || "Cancelled by organizer",
      },
    });
    await logAudit({
      actorUserId: req.user!.id,
      action: "eventRegistration.cancelled",
      entityType: "EventRegistration",
      entityId: updated.id,
      metadata: { eventId: event.id },
    });
    if (updated.userId) {
      void enqueueRegistrationNotification({
        type: "REGISTRATION_CANCELLED",
        registrationId: updated.id,
        userId: updated.userId,
        eventId: event.id,
        eventTitle: event.title,
        status: updated.status,
        cancellationReason: updated.cancellationReason,
        actorUserId: req.user!.id,
      }).catch(() => undefined);
    }
    return res.json({ registration: updated });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.eventRegistrationSettings.upsert({
      where: { eventId: event.id },
      update: {},
      create: { eventId: event.id },
    });
    await tx.$queryRaw(Prisma.sql`SELECT id FROM event_registration_settings WHERE "eventId" = ${event.id} FOR UPDATE`);
    const settings = await tx.eventRegistrationSettings.findUniqueOrThrow({ where: { eventId: event.id } });

    if (settings.capacity !== null) {
      const used = await tx.eventRegistration.count({
        where: { eventId: event.id, status: "CONFIRMED" },
      });
      if (used >= settings.capacity) {
        throw new Error("REGISTRATION_CAPACITY_FULL");
      }
    }

    return tx.eventRegistration.update({
      where: { id: registration.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), cancelledAt: null, cancellationReason: null },
    });
  }).catch((error) => {
    if (error instanceof Error && error.message === "REGISTRATION_CAPACITY_FULL") return null;
    throw error;
  });

  if (!updated) return res.status(409).json({ error: "Registration capacity is already full" });

  await logAudit({
    actorUserId: req.user!.id,
    action: "eventRegistration.confirmed",
    entityType: "EventRegistration",
    entityId: updated.id,
    metadata: { eventId: event.id },
  });

  if (updated.userId) {
    void enqueueRegistrationNotification({
      type: "REGISTRATION_CONFIRMED",
      registrationId: updated.id,
      userId: updated.userId,
      eventId: event.id,
      eventTitle: event.title,
      status: updated.status,
      actorUserId: req.user!.id,
    }).catch(() => undefined);
  }

  return res.json({ registration: updated });
});

export default router;
