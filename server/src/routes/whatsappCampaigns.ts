import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { prisma } from "../lib/prisma";
import { logAudit } from "../lib/audit";
import { enqueueNotificationIntent } from "../lib/notificationOutboxService";
import { profileMutationRateLimit } from "../middleware/rateLimit";

const router = Router();
router.use(requireAuth, requireOrganizerAccess);
const audienceSchema = z.enum(["CONFIRMED_REGISTRATIONS", "TICKET_HOLDERS"]);
const createSchema = z.object({ eventId: z.string().uuid(), name: z.string().trim().min(2).max(120), message: z.string().trim().min(1).max(2000), audience: audienceSchema, scheduledAt: z.never().optional() });
async function loadEvent(eventId: string, req: import("express").Request, permission: "whatsappCampaign:view" | "whatsappCampaign:manage") {
  const organizerIds = await organizerIdsWithPermission(req.user!, permission);
  if (organizerIds.length === 0) return null;
  return prisma.event.findFirst({ where: { id: eventId, organizerId: { in: organizerIds }, archivedAt: null }, select: { id: true, organizerId: true, title: true } });
}
router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "whatsappCampaign:view");
  if (organizerIds.length === 0) return res.json({ campaigns: [], total: 0 });
  const eventId = typeof req.query.eventId === "string" ? req.query.eventId : undefined;
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`SELECT c.id, c.organizer_id AS "organizerId", c.event_id AS "eventId", e.title AS "eventTitle", c.name, c.message, c.audience, c.status, c.scheduled_at AS "scheduledAt", c.created_at AS "createdAt", c.updated_at AS "updatedAt", COUNT(r.id)::int AS "recipientCount", COUNT(r.id) FILTER (WHERE r.status = 'PENDING')::int AS "pendingCount" FROM whatsapp_campaigns c JOIN events e ON e.id = c.event_id LEFT JOIN whatsapp_campaign_recipients r ON r.campaign_id = c.id WHERE c.organizer_id = ANY(${organizerIds}) ${eventId ? Prisma.sql`AND c.event_id = ${eventId}` : Prisma.empty} GROUP BY c.id, e.title ORDER BY c.created_at DESC`);
  return res.json({ campaigns: rows, total: rows.length });
});
router.post("/", profileMutationRateLimit, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid campaign payload" });
  const event = await loadEvent(parsed.data.eventId, req, "whatsappCampaign:manage");
  if (!event) return res.status(404).json({ error: "Event not found" });
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`INSERT INTO whatsapp_campaigns (organizer_id, event_id, name, message, audience, status, scheduled_at, created_by) VALUES (${event.organizerId}, ${event.id}, ${parsed.data.name}, ${parsed.data.message}, ${parsed.data.audience}::"WhatsAppCampaignAudience", 'DRAFT'::"WhatsAppCampaignStatus", NULL, ${req.user!.id}) RETURNING id`);
  const id = rows[0].id;
  await logAudit({ actorUserId: req.user!.id, action: "whatsapp.campaign_created", entityType: "WhatsAppCampaign", entityId: id, metadata: { eventId: event.id, audience: parsed.data.audience, scheduled: false } });
  return res.status(201).json({ campaign: { id, eventId: event.id, organizerId: event.organizerId, name: parsed.data.name, audience: parsed.data.audience, status: "DRAFT", scheduledAt: null } });
});
router.post("/:id/send", profileMutationRateLimit, async (req, res) => {
  const campaigns = await prisma.$queryRaw<Array<{ id: string; organizer_id: string; event_id: string; name: string; message: string; audience: string; status: string }>>(Prisma.sql`SELECT id, organizer_id, event_id, name, message, audience, status FROM whatsapp_campaigns WHERE id = ${req.params.id} LIMIT 1`);
  const campaign = campaigns[0];
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  const organizerIds = await organizerIdsWithPermission(req.user!, "whatsappCampaign:manage");
  if (!organizerIds.includes(campaign.organizer_id)) return res.status(404).json({ error: "Campaign not found" });
  if (campaign.status !== "DRAFT") return res.status(409).json({ error: "Campaign cannot be sent in its current state" });
  const recipients = campaign.audience === "TICKET_HOLDERS"
    ? await prisma.$queryRaw<Array<{ user_id: string; phone_e164: string }>>(Prisma.sql`SELECT DISTINCT c.user_id, c.phone_e164 FROM event_tickets t JOIN whatsapp_consents c ON c.user_id = t.user_id WHERE t.event_id = ${campaign.event_id} AND t.status = 'ACTIVE' AND c.status = 'OPTED_IN'`)
    : await prisma.$queryRaw<Array<{ user_id: string; phone_e164: string }>>(Prisma.sql`SELECT DISTINCT r.user_id, c.phone_e164 FROM event_registrations r JOIN whatsapp_consents c ON c.user_id = r.user_id WHERE r.event_id = ${campaign.event_id} AND r.status = 'CONFIRMED' AND r.user_id IS NOT NULL AND c.status = 'OPTED_IN'`);
  if (recipients.length === 0) return res.status(409).json({ error: "No opted-in recipients match this audience" });
  await prisma.$executeRaw(Prisma.sql`UPDATE whatsapp_campaigns SET status = 'QUEUED', updated_at = NOW(), scheduled_at = NULL WHERE id = ${campaign.id} AND status IN ('DRAFT', 'SCHEDULED')`);
  let created = 0;
  for (const recipient of recipients) {
    const inserted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`INSERT INTO whatsapp_campaign_recipients (campaign_id, user_id, phone_e164, status) VALUES (${campaign.id}, ${recipient.user_id}, ${recipient.phone_e164}, 'PENDING') ON CONFLICT (campaign_id, user_id) DO NOTHING RETURNING id`);
    if (inserted.length === 0) continue;
    const intent = await enqueueNotificationIntent({ eventKey: `whatsapp_campaign:${campaign.id}`, idempotencyKey: `whatsapp_campaign:${campaign.id}:${recipient.user_id}`, eventType: "WHATSAPP_CAMPAIGN", entityType: "WhatsAppCampaign", entityId: campaign.id, payload: { userId: recipient.user_id, organizerId: campaign.organizer_id, campaignId: campaign.id, campaignName: campaign.name, whatsappParameters: [campaign.message], title: campaign.name, message: campaign.message, actionUrl: "/notifications" }, actorUserId: req.user!.id });
    await prisma.$executeRaw(Prisma.sql`UPDATE whatsapp_campaign_recipients SET intent_id = ${intent.id}, status = 'QUEUED', updated_at = NOW() WHERE id = ${inserted[0].id}`);
    created++;
  }
  await prisma.$executeRaw(Prisma.sql`UPDATE whatsapp_campaigns SET status = 'QUEUED', updated_at = NOW() WHERE id = ${campaign.id}`);
  await logAudit({ actorUserId: req.user!.id, action: "whatsapp.campaign_send_queued", entityType: "WhatsAppCampaign", entityId: campaign.id, metadata: { recipientCount: created } });
  return res.status(202).json({ campaignId: campaign.id, queuedRecipients: created });
});
router.post("/:id/cancel", profileMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "whatsappCampaign:manage");
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`SELECT id, status FROM whatsapp_campaigns WHERE id = ${req.params.id} AND organizer_id = ANY(${organizerIds}) LIMIT 1`);
  if (!rows[0]) return res.status(404).json({ error: "Campaign not found" });
  if (rows[0].status !== "DRAFT") return res.status(409).json({ error: "Only draft or scheduled campaigns can be cancelled" });
  await prisma.$executeRaw(Prisma.sql`UPDATE whatsapp_campaigns SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() WHERE id = ${req.params.id}`);
  await logAudit({ actorUserId: req.user!.id, action: "whatsapp.campaign_cancelled", entityType: "WhatsAppCampaign", entityId: req.params.id, metadata: {} });
  return res.json({ cancelled: true });
});
export default router;