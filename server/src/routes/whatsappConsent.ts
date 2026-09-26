import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { profileMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";
import { normalizeWhatsAppPhone } from "../lib/whatsapp";

const router = Router();
router.use(requireAuth);

const optInSchema = z.object({
  phoneE164: z.string().trim().min(8).max(16),
  source: z.string().trim().min(1).max(100),
});

router.get("/consent", async (req, res) => {
  const consent = await prisma.whatsAppConsent.findUnique({ where: { userId: req.user!.id } });
  res.json({ consent });
});

router.post("/consent/opt-in", profileMutationRateLimit, async (req, res) => {
  const parsed = optInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  let phoneDigits: string;
  try {
    phoneDigits = normalizeWhatsAppPhone(parsed.data.phoneE164);
  } catch {
    return res.status(400).json({ error: "phoneE164 must be a valid E.164 number" });
  }

  const now = new Date();
  const consent = await prisma.whatsAppConsent.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, phoneE164: phoneDigits, status: "OPTED_IN", source: parsed.data.source, consentedAt: now },
    update: { phoneE164: phoneDigits, status: "OPTED_IN", source: parsed.data.source, consentedAt: now, revokedAt: null },
  });

  await logAudit({ actorUserId: req.user!.id, action: "whatsapp.consent_opted_in", entityType: "WhatsAppConsent", entityId: consent.id, metadata: { source: parsed.data.source } });
  res.json({ consent });
});

router.post("/consent/opt-out", profileMutationRateLimit, async (req, res) => {
  const existing = await prisma.whatsAppConsent.findUnique({ where: { userId: req.user!.id } });
  if (!existing) return res.json({ consent: null });

  const consent = await prisma.whatsAppConsent.update({
    where: { userId: req.user!.id },
    data: { status: "OPTED_OUT", revokedAt: new Date() },
  });

  await logAudit({ actorUserId: req.user!.id, action: "whatsapp.consent_opted_out", entityType: "WhatsAppConsent", entityId: consent.id, metadata: {} });
  res.json({ consent });
});

export default router;
