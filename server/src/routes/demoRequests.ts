import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { logAudit } from "../lib/audit";
import { organizerDemoRequestRateLimit } from "../middleware/rateLimit";

const router = Router();

const EVENT_TYPES = ["exhibition", "trade_show", "expo", "conference", "fair", "other"] as const;
const EVENT_VOLUME_OPTIONS = ["1", "2-5", "6-10", "11-25", "25+"] as const;

const demoRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  companyName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  eventType: z.enum(EVENT_TYPES),
  expectedEventsPerYear: z.enum(EVENT_VOLUME_OPTIONS),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  source: z.literal("organizer_landing_page").default("organizer_landing_page"),
  utmSource: z.string().trim().max(100).optional().or(z.literal("")),
  utmMedium: z.string().trim().max(100).optional().or(z.literal("")),
  utmCampaign: z.string().trim().max(150).optional().or(z.literal("")),
  utmTerm: z.string().trim().max(150).optional().or(z.literal("")),
  utmContent: z.string().trim().max(150).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
});

const genericSuccess = { accepted: true };

router.post("/demo-requests", organizerDemoRequestRateLimit, async (req, res) => {
  const parsed = demoRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid demo request" });
  }

  // Honeypot: return the same success shape without storing obvious bot submissions.
  if (parsed.data.website?.trim()) return res.status(202).json(genericSuccess);

  const email = parsed.data.email.toLowerCase();
  const phone = parsed.data.phone?.trim() || null;
  const message = parsed.data.message?.trim() || null;
  const source = parsed.data.source;
  const attribution = {
    source,
    utmSource: parsed.data.utmSource?.trim() || null,
    utmMedium: parsed.data.utmMedium?.trim() || null,
    utmCampaign: parsed.data.utmCampaign?.trim() || null,
    utmTerm: parsed.data.utmTerm?.trim() || null,
    utmContent: parsed.data.utmContent?.trim() || null,
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize submissions for the same email so concurrent double-clicks
      // cannot create duplicate sales leads during the 24-hour cooldown.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${email}))`;

      const recent = await tx.supportTicket.findFirst({
        where: {
          kind: "demo_request",
          requesterEmail: email,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });

      if (recent) return { created: false, id: recent.id };

      const ticket = await tx.supportTicket.create({
        data: {
          kind: "demo_request",
          subject: `Organizer demo request — ${parsed.data.companyName}`,
          category: "exhibition",
          priority: "medium",
          requesterName: parsed.data.name,
          requesterEmail: email,
          eventType: parsed.data.eventType,
          expectedEventsPerYear: parsed.data.expectedEventsPerYear,
          source,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          utmTerm: attribution.utmTerm,
          utmContent: attribution.utmContent,
          messages: {
            create: {
              body: [
                `Company: ${parsed.data.companyName}`,
                `Phone: ${phone ?? "Not provided"}`,
                `Event type: ${parsed.data.eventType}`,
                `Expected events/year: ${parsed.data.expectedEventsPerYear}`,
                message ? `Message: ${message}` : null,
              ].filter(Boolean).join("\n"),
              isInternalNote: false,
            },
          },
        },
        select: { id: true },
      });

      return { created: true, id: ticket.id };
    });

    await logAudit({
      actorUserId: null,
      action: result.created ? "marketing.demo_request_created" : "marketing.demo_request_duplicate",
      entityType: "SupportTicket",
      entityId: result.id,
      metadata: { kind: "demo_request", source },
    });

    return res.status(result.created ? 201 : 202).json(genericSuccess);
  } catch (error) {
    console.error("Organizer demo request failed:", error);
    return res.status(500).json({ error: "Unable to submit your request right now. Please try again." });
  }
});

export default router;
