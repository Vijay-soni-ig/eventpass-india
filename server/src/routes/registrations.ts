import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { optionalAuth } from "../middleware/auth";
import { registrationCreationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";
import { enqueueRegistrationNotification } from "../lib/registrationNotificationService";

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
      moduleEnablements: { where: { moduleType: "REGISTRATION", enabled: true }, select: { id: true } },
    },
  });
  if (!event) return res.status(404).json({ error: "Event not found or registration is not available" });
  if (event.moduleEnablements.length === 0) return res.status(409).json({ error: "Registration is not enabled for this event" });

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
    const result = await prisma.$transaction(async (tx) => {
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
      const existingByUser = req.user
        ? await tx.eventRegistration.findUnique({
            where: { eventId_userId: { eventId: event.id, userId: req.user.id } },
          })
        : null;

      const activeByEmail = existingByEmail && existingByEmail.status !== "CANCELLED" ? existingByEmail : null;
      const activeByUser = existingByUser && existingByUser.status !== "CANCELLED" ? existingByUser : null;

      if (activeByEmail) {
        const error = new Error("An active registration already exists for this email");
        error.name = "DUPLICATE_EMAIL";
        throw error;
      }

      if (activeByUser) {
        const error = new Error("This account is already registered for this event");
        error.name = "DUPLICATE_USER";
        throw error;
      }

      // Cancellation is a terminal state for the current registration attempt,
      // but the attendee may explicitly register again. We reuse the cancelled
      // row so the existing event/email and event/user uniqueness guarantees stay
      // intact while audit history records the cancellation and re-registration.
      const cancelledByEmail = existingByEmail?.status === "CANCELLED" ? existingByEmail : null;
      const cancelledByUser = existingByUser?.status === "CANCELLED" ? existingByUser : null;
      const reactivationCandidate = cancelledByEmail ?? cancelledByUser;

      if (cancelledByEmail && cancelledByUser && cancelledByEmail.id !== cancelledByUser.id) {
        const error = new Error("This account or email has an existing cancelled registration that cannot be reactivated automatically");
        error.name = "DUPLICATE_CANCELLED_REGISTRATION";
        throw error;
      }

      if (cancelledByEmail && cancelledByEmail.userId && cancelledByEmail.userId !== req.user?.id) {
        const error = new Error("An existing cancelled registration already belongs to another account");
        error.name = "DUPLICATE_EMAIL";
        throw error;
      }

      if (cancelledByUser && cancelledByUser.email !== parsed.data.email) {
        const emailOwner = await tx.eventRegistration.findUnique({
          where: { eventId_email: { eventId: event.id, email: parsed.data.email } },
        });
        if (emailOwner && emailOwner.id !== cancelledByUser.id) {
          const error = new Error("An existing registration already uses this email");
          error.name = "DUPLICATE_EMAIL";
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
      if (reactivationCandidate) {
        const registration = await tx.eventRegistration.update({
          where: { id: reactivationCandidate.id },
          data: {
            userId: req.user?.id ?? reactivationCandidate.userId,
            fullName: parsed.data.fullName,
            email: parsed.data.email,
            phone: parsed.data.phone || null,
            companyName: parsed.data.companyName || null,
            consentAccepted: true,
            status,
            source: "PUBLIC",
            registeredAt: new Date(),
            confirmedAt: status === "CONFIRMED" ? new Date() : null,
            cancelledAt: null,
            cancellationReason: null,
            idempotencyKey,
          },
        });
        return { registration, reactivated: true };
      }

      const registration = await tx.eventRegistration.create({
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
      return { registration, reactivated: false };
    });

    await logAudit({
      actorUserId: req.user?.id ?? null,
      action: result.reactivated ? "eventRegistration.reactivated" : "eventRegistration.created",
      entityType: "EventRegistration",
      entityId: result.registration.id,
      metadata: {
        eventId: event.id,
        status: result.registration.status,
        source: "PUBLIC",
        reactivated: result.reactivated,
      },
    });

    if (result.registration.userId) {
      void enqueueRegistrationNotification({
        type: "REGISTRATION_SUBMITTED",
        registrationId: result.registration.id,
        userId: result.registration.userId,
        eventId: event.id,
        eventTitle: event.title,
        status: result.registration.status,
        reactivated: result.reactivated,
        actorUserId: req.user?.id ?? null,
      }).catch(() => undefined);
      if (result.registration.status === "CONFIRMED") {
        void enqueueRegistrationNotification({
          type: "REGISTRATION_CONFIRMED",
          registrationId: result.registration.id,
          userId: result.registration.userId,
          eventId: event.id,
          eventTitle: event.title,
          status: result.registration.status,
          reactivated: result.reactivated,
          actorUserId: req.user?.id ?? null,
        }).catch(() => undefined);
      }
    }
    return res.status(201).json({ registration: result.registration, reactivated: result.reactivated });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.name === "DUPLICATE_EMAIL" ||
        error.name === "DUPLICATE_USER" ||
        error.name === "DUPLICATE_CANCELLED_REGISTRATION"
      ) return res.status(409).json({ error: error.message });
      if (error.name === "CAPACITY_REACHED") return res.status(409).json({ error: error.message });
      if (error.name === "PrismaClientKnownRequestError") return res.status(409).json({ error: "Registration could not be created because it conflicts with an existing registration" });
    }
    throw error;
  }
});

export default router;
