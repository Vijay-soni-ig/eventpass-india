import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { enqueueNotificationIntent } from "../src/lib/notificationOutboxService";
import { getNotificationEvent } from "../src/lib/notificationEventRegistry";
import { getNotificationTemplate } from "../src/lib/notificationTemplates";
test("WhatsApp campaign is registered as a WhatsApp-only notification", () => {
  assert.ok(getNotificationEvent("WHATSAPP_CAMPAIGN"));
  assert.deepEqual(getNotificationTemplate("WHATSAPP_CAMPAIGN")?.channels, ["WHATSAPP"]);
});
test("campaign recipient intent is idempotent", async () => {
  const idempotencyKey = `test-campaign:${randomUUID()}`;
  const input = { eventKey: `test-campaign:${randomUUID()}`, idempotencyKey, eventType: "WHATSAPP_CAMPAIGN", entityType: "WhatsAppCampaign", entityId: randomUUID(), payload: { userId: randomUUID(), whatsappParameters: ["test"] } };
  const first = await enqueueNotificationIntent(input);
  const second = await enqueueNotificationIntent(input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  await prisma.$executeRaw`DELETE FROM notification_intents WHERE id = ${first.id}`;
});