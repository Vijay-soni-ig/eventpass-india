import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { logAudit } from "../lib/audit";
import { contactRequestRateLimit } from "../middleware/rateLimit";

const router = Router();

const PHONE_PATTERN = /^[+()\d][\d\s\-()]{6,19}$/;
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const contactRequestSchema = z.object({
  userType: z.enum(["visitor", "exhibitor"]),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number").optional().or(z.literal("")),
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(2000),
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(150),
  utmTerm: optionalText(150),
  utmContent: optionalText(150),
  // Honeypot: real visitors never see or fill this field, so any content means a bot.
  website: z.string().max(500).optional(),
});

const SOURCE = "contact_page";

router.post("/contact-requests", contactRequestRateLimit, async (req, res) => {
  const parsed = contactRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid contact request" });
  }
  const data = parsed.data;

  // Same success shape as a stored message, so a bot cannot tell it was dropped.
  if (data.website?.trim()) return res.status(202).json({ accepted: true });

  const email = data.email.toLowerCase();
  const phone = data.phone?.trim() || null;

  try {
    const ticket = await prisma.supportTicket.create({
      data: {
        kind: "support",
        subject: data.subject,
        category: data.userType,
        priority: "medium",
        requesterName: data.name,
        requesterEmail: email,
        source: SOURCE,
        utmSource: data.utmSource?.trim() || null,
        utmMedium: data.utmMedium?.trim() || null,
        utmCampaign: data.utmCampaign?.trim() || null,
        utmTerm: data.utmTerm?.trim() || null,
        utmContent: data.utmContent?.trim() || null,
        messages: {
          create: {
            body: [`Phone: ${phone ?? "Not provided"}`, `I am a: ${data.userType}`, "", data.message].join("\n"),
            isInternalNote: false,
          },
        },
      },
      select: { id: true },
    });

    await logAudit({
      actorUserId: null,
      action: "marketing.contact_request_created",
      entityType: "SupportTicket",
      entityId: ticket.id,
      metadata: { kind: "support", source: SOURCE },
    });

    return res.status(201).json({ accepted: true });
  } catch (error) {
    console.error("Contact request failed:", error);
    return res.status(500).json({ error: "Unable to send your message right now. Please try again or email us directly." });
  }
});

export default router;
