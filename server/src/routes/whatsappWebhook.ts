import { Router } from "express";
import { prisma } from "../lib/prisma";
import { verifyWhatsAppSignature } from "../lib/whatsapp";

const router = Router();

router.get("/", (req, res) => {
  const mode = typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : undefined;
  const token = typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : undefined;
  const challenge = typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : undefined;
  if (mode !== "subscribe" || token !== process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || !challenge) return res.sendStatus(403);
  return res.status(200).send(challenge);
});

router.post("/", async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  if (!verifyWhatsAppSignature(rawBody, req.header("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) return res.sendStatus(401);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  res.sendStatus(200);

  const body = payload as {
    entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{
      id?: string; status?: string; timestamp?: string;
      errors?: Array<{ code?: number; title?: string }>;
    }> } }> }>;
  };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const statusAt = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
        const validStatusAt = Number.isNaN(statusAt.getTime()) ? new Date() : statusAt;
        const errorText = status.errors?.map((error) => [error.code, error.title].filter(Boolean).join(": ")).filter(Boolean).join("; ") || null;
        const statusMap: Record<string, string> = { sent: "SENT", delivered: "DELIVERED", read: "DELIVERED", failed: "FAILED" };
        const mappedStatus = statusMap[status.status];
        if (!mappedStatus) continue;

        await prisma.$executeRawUnsafe(
          "UPDATE notification_deliveries SET status = $1, provider_status_at = $2, delivered_at = CASE WHEN $1 = 'DELIVERED' THEN COALESCE(delivered_at, $2) ELSE delivered_at END, last_error = COALESCE($3, last_error), locked_at = NULL, locked_by = NULL, updated_at = NOW() WHERE provider_message_id = $4 AND (provider_status_at IS NULL OR provider_status_at <= $2)",
          mappedStatus, validStatusAt, errorText, status.id,
        );
      }
    }
  }
});

export default router;
