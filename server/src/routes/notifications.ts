import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { profileMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

// Phase 22.3 — notifications are entirely user-owned. Every route below
// resolves the target from req.user!.id (the authenticated identity) and
// NEVER from any client-supplied userId — there is no "recipient" or
// "owner" field accepted from the request body/query anywhere in this file.
const router = Router();

router.use(requireAuth);

const DEFAULT_PREFERENCES = {
  eventPublished: true,
  eventUpdated: true,
  eventDateChanged: true,
  ticketsAvailable: true,
  organizerProfileUpdated: true,
};

const PAGE_SIZE_MAX = 50;
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
  filter: z.enum(["all", "unread", "read"]).default("all"),
});

router.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { page, limit, filter } = parsed.data;

  const where = {
    userId: req.user!.id,
    ...(filter === "unread" ? { readAt: null } : {}),
    ...(filter === "read" ? { readAt: { not: null } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  res.json({ items, total, page, pageSize: limit });
});

router.get("/unread-count", async (req, res) => {
  const unreadCount = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ unreadCount });
});

router.patch("/read-all", profileMutationRateLimit, async (req, res) => {
  // Idempotent by construction: re-running this only ever touches rows that
  // are still unread (readAt: null), so a repeat call is a harmless no-op.
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  const unreadCount = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ unreadCount });
});

router.patch("/:id/read", profileMutationRateLimit, async (req, res) => {
  const notification = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!notification) return res.status(404).json({ error: "Notification not found" });

  // Idempotent: marking an already-read notification as read again is a
  // no-op, not an error — repeated PATCH calls (e.g. a double-click, a
  // retried request) must never fail or produce a duplicate side effect.
  const updated = notification.readAt
    ? notification
    : await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });

  res.json({ notification: updated });
});

router.get("/preferences", async (req, res) => {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId: req.user!.id } });
  res.json({ preferences: pref ?? { userId: req.user!.id, ...DEFAULT_PREFERENCES } });
});

const preferencesUpdateSchema = z.object({
  eventPublished: z.boolean().optional(),
  eventUpdated: z.boolean().optional(),
  eventDateChanged: z.boolean().optional(),
  ticketsAvailable: z.boolean().optional(),
  organizerProfileUpdated: z.boolean().optional(),
});

router.patch("/preferences", profileMutationRateLimit, async (req, res) => {
  const parsed = preferencesUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "No fields to update" });

  const pref = await prisma.notificationPreference.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...DEFAULT_PREFERENCES, ...parsed.data },
    update: parsed.data,
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "notification.preferences_updated",
    entityType: "NotificationPreference",
    entityId: pref.id,
    metadata: { changedFields: Object.keys(parsed.data) },
  });

  res.json({ preferences: pref });
});

export default router;
