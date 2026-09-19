import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { optionalAuth } from "../middleware/auth";
import { registrationCreationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

const router = Router();

const createRegistrationSchema = z.object({
  eventId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(30).optional(),
  companyName: z.string().trim().max(160).optional(),
  consentAccepted: z.literal(true),
});

router.post("/", registrationCreationRateLimit, optionalAuth, async (req, res) => {
  const parsed = createRegistrationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const idempotencyKey = String(req.get("Idempotency-Key") ?? "").trim() || null;
  if (idempotencyKey && idempotencyKey.length > 200) {
    return res.status(400).json({ error: "Idempotency-Key must be at most 200 characters" });
  }

  const event = await prisma.event.findFirst({
    where: {
      id: parsed.data.eventId,
      status: "PUBLISHED",
      visibility: "public",
      archivedAt: null,
    },
    select: {
      id: true,
      organizerId: true,
      title: true,
      registrationSettings: true,
    },
  });
  if (!event) return res.status(404).json({ error: "Event not found or registration is not available" });

  if (event.registrationSettings?.enabled === false) {
    return res.status(409).json({ error: "Registration is currently closed for this event" });
  }

  if (idempotencyKey) {
    const existingByKey = await prisma.eventRegistration.findUnique({
      where: { eventId_idempotencyKey: { eventId: event.id, idempotencyKey } },
    });
    if (existingByKey) return res.status(200).json({ registration: existingByKey, idempotentReplay: true });
  }

  try {
    const registration = await prisma.$transaction(async (tx) => {
      // A per-event settings row is the serialization point for capacity.
      // Every public registration locks the same row before counting seats,
      // so concurrent requests cannot both consume the last slot.
      await tx.eventRegistrationSettings.upsert({
        where: { eventId: event.id },
        update: {},
        create: { eventId: event.id },
      });
      await tx.$queryRaw(Prisma.sql`SELECT id FROM event_registration_settings WHERE "eventId" = ${event.id} FOR UPDATE`);

      const settings = await tx.eventRegistrationSettings.findUniqueOrThrow({ where: { eventId: event.id } });

      const existingByEmail = await tx.eventRegistration.findUnique({
        where: { eventId_email: { eventId: event.id, email: parsed.data.email } },
      });
      if (existingByEmail) {
        const error = new Error("An active registration already exists for this email");
        error.name = "DUPLICATE_EMAIL";
        throw error;
      }

      if (req.user) {
        const existingByUser = await tx.eventRegistration.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: req.user.id } },
        });
        if (existingByUser) {
          const error = new Error("This account is already registered for this event");
          error.name = "DUPLICATE_USER";
          throw error;
        }
      }

      if (settings.capacity !== null) {
        const used = await tx.eventRegistration.count({
          where: {
            eventId: event.id,
            status: { in: ["PENDING", "CONFIRMED"] },
          },
        });
        if (used >= settings.capacity) {
          const error = new Error("Registration capacity has been reached");
          error.name = "CAPACITY_REACHED";
          throw error;
        }
      }

      const status = settings.requiresApproval ? "PENDING" : "CONFIRMED";
      return tx.eventRegistration.create({
        data: {
          eventId: event.id,
          userId: req.user?.id,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          phone: parsed.data.phone || null,
          companyName: parsed.data.companyName || null,
          consentAccepted: true,
          status,
          source: "PUBLIC",
          confirmedAt: status === "CONFIRMED" ? new Date() : null,
          idempotencyKey,
        },
      });
    });

    await logAudit({
      actorUserId: req.user?.id ?? null,
      action: "eventRegistration.created",
      entityType: "EventRegistration",
      entityId: registration.id,
      metadata: { eventId: event.id, status: registration.status, source: "PUBLIC" },
    });

    return res.status(201).json({ registration });
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "DUPLICATE_EMAIL" || error.name === "DUPLICATE_USER") return res.status(409).json({ error: error.message });
      if (error.name === "CAPACITY_REACHED") return res.status(409).json({ error: error.message });
      if (error.name === "PrismaClientKnownRequestError") return res.status(409).json({ error: "Registration could not be created because it conflicts with an existing registration" });
    }
    throw error;
  }
});

export default router;
