import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { normalizeWhatsAppPhone, verifyWhatsAppSignature } from "../src/lib/whatsapp";
import { NOTIFICATION_CHANNELS } from "../src/lib/notificationOutboxService";
import { getNotificationTemplate } from "../src/lib/notificationTemplates";

test("normalizes valid E.164 WhatsApp numbers and rejects invalid values", () => {
  assert.equal(normalizeWhatsAppPhone("+919876543210"), "919876543210");
  assert.throws(() => normalizeWhatsAppPhone("9876543210"));
  assert.throws(() => normalizeWhatsAppPhone("+0123456789"));
});

test("verifies WhatsApp webhook HMAC using timing-safe comparison", () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = "test-app-secret";
  const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyWhatsAppSignature(body, signature, secret), true);
  assert.equal(verifyWhatsAppSignature(body, signature + "00", secret), false);
  assert.equal(verifyWhatsAppSignature(body, undefined, secret), false);
});

test("notification foundation exposes WhatsApp channel and templates", () => {
  assert.equal(NOTIFICATION_CHANNELS.includes("WHATSAPP"), true);
  assert.equal(getNotificationTemplate("REGISTRATION_CONFIRMED")?.channels.includes("WHATSAPP"), true);
  assert.equal(getNotificationTemplate("EVENT_PUBLISHED")?.channels.includes("WHATSAPP"), false);
});
