import { Router } from "express";
import { httpUrl } from "../lib/httpUrl";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { profileMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(requireAuth);

const subscriptionSchema = z.object({
  endpoint: httpUrl(2048).refine((value) => value.startsWith("https://"), "Push endpoint must use HTTPS"),
  keys: z.object({
    p256dh: z.string().min(40).max(200).regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid p256dh key"),
    auth: z.string().min(16).max(100).regex(/^[A-Za-z0-9_-]+={0,2}$/, "Invalid auth key"),
  }),
});

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

router.get("/push", async (_req, res) => {
  const vapid = getVapidConfig();
  if (!vapid) {
    return res.status(503).json({ enabled: false, error: "Push notifications are not configured" });
  }
  return res.json({ enabled: true, publicKey: vapid.publicKey });
});

router.get("/push/subscriptions", async (req, res) => {
  const subscriptions = await prisma.notificationPushSubscription.findMany({
    where: { userId: req.user!.id, revokedAt: null },
    select: { id: true, endpoint: true, userAgent: true, createdAt: true, updatedAt: true, lastUsedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ enabled: Boolean(getVapidConfig()), subscriptions });
});

router.post("/push/subscriptions", profileMutationRateLimit, async (req, res) => {
  if (!getVapidConfig()) return res.status(503).json({ error: "Push notifications are not configured" });
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid push subscription" });

  const existing = await prisma.notificationPushSubscription.findUnique({
    where: { endpoint: parsed.data.endpoint },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (existing && existing.userId !== req.user!.id) {
    return res.status(409).json({ error: "Push subscription is already associated with another account" });
  }

  const subscription = await prisma.notificationPushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: {
      userId: req.user!.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
      lastUsedAt: new Date(),
    },
    update: {
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
      revokedAt: null,
      lastUsedAt: new Date(),
    },
    select: { id: true, endpoint: true, userAgent: true, createdAt: true, updatedAt: true, lastUsedAt: true },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "notification.push_subscription_registered",
    entityType: "NotificationPushSubscription",
    entityId: subscription.id,
    metadata: { endpointOrigin: new URL(subscription.endpoint).origin },
  });

  res.status(201).json({ subscription });
});

router.delete("/push/subscriptions/:id", profileMutationRateLimit, async (req, res) => {
  const subscription = await prisma.notificationPushSubscription.findFirst({
    where: { id: req.params.id, userId: req.user!.id, revokedAt: null },
    select: { id: true },
  });
  if (!subscription) return res.status(404).json({ error: "Push subscription not found" });

  await prisma.notificationPushSubscription.update({
    where: { id: subscription.id },
    data: { revokedAt: new Date() },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "notification.push_subscription_revoked",
    entityType: "NotificationPushSubscription",
    entityId: subscription.id,
  });

  res.status(204).send();
});

export default router;
