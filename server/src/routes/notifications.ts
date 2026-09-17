import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { profileMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";
import { getNotificationEvent, NOTIFICATION_EVENTS } from "../lib/notificationEventRegistry";

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
const CHANNELS = ["IN_APP", "EMAIL", "PUSH"] as const;
const channelSchema = z.enum(CHANNELS);

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
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
  ]);
  res.json({ items, total, page, pageSize: limit });
});

router.get("/unread-count", async (req, res) => {
  const unreadCount = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ unreadCount });
});

router.patch("/read-all", profileMutationRateLimit, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  const unreadCount = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ unreadCount });
});

router.patch("/:id/read", profileMutationRateLimit, async (req, res) => {
  const notification = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!notification) return res.status(404).json({ error: "Notification not found" });
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
  await logAudit({ actorUserId: req.user!.id, action: "notification.preferences_updated", entityType: "NotificationPreference", entityId: pref.id, metadata: { changedFields: Object.keys(parsed.data) } });
  res.json({ preferences: pref });
});

router.get("/channel-preferences", async (req, res) => {
  const rows = await prisma.$queryRaw<Array<{ id: string; event_type: string; channel: string; enabled: boolean; created_at: Date; updated_at: Date }>>(Prisma.sql`
    SELECT id, event_type, channel, enabled, created_at, updated_at
    FROM notification_channel_preferences
    WHERE user_id = ${req.user!.id}
    ORDER BY event_type ASC, channel ASC
  `);
  const overrides = new Map(rows.map((row) => [`${row.event_type}:${row.channel}`, row.enabled]));
  const preferences = Object.keys(NOTIFICATION_EVENTS).flatMap((eventType) =>
    CHANNELS.map((channel) => {
      const override = overrides.get(`${eventType}:${channel}`);
      const enabled = override ?? true;
      const row = rows.find((candidate) => candidate.event_type === eventType && candidate.channel === channel);
      return {
        id: row?.id ?? null,
        eventType,
        channel,
        enabled,
        isOverride: override !== undefined,
        createdAt: row?.created_at ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    }),
  );
  res.json({ preferences });
});

const channelPreferenceSchema = z.object({
  eventType: z.string().trim().min(1).max(100),
  channel: channelSchema,
  enabled: z.boolean(),
});

router.put("/channel-preferences", profileMutationRateLimit, async (req, res) => {
  const parsed = channelPreferenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { eventType, channel, enabled } = parsed.data;
  if (!getNotificationEvent(eventType)) {
    return res.status(400).json({ error: `Unsupported notification event type: ${eventType}` });
  }
  const rows = await prisma.$queryRaw<Array<{ id: string; event_type: string; channel: string; enabled: boolean; created_at: Date; updated_at: Date }>>(Prisma.sql`
    INSERT INTO notification_channel_preferences (user_id, event_type, channel, enabled, created_at, updated_at)
    VALUES (${req.user!.id}, ${eventType}, ${channel}, ${enabled}, NOW(), NOW())
    ON CONFLICT (user_id, event_type, channel)
    DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
    RETURNING id, event_type, channel, enabled, created_at, updated_at
  `);
  const row = rows[0];
  await logAudit({ actorUserId: req.user!.id, action: "notification.channel_preference_updated", entityType: "NotificationChannelPreference", entityId: row.id, metadata: { eventType, channel, enabled } });
  res.json({ preference: { id: row.id, eventType: row.event_type, channel: row.channel, enabled: row.enabled, createdAt: row.created_at, updatedAt: row.updated_at } });
});

export default router;
