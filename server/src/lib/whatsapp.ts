import { createHash, createHmac, timingSafeEqual } from "crypto";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeWhatsAppPhone(input: string): string {
  const trimmed = input.trim();
  if (!E164_PATTERN.test(trimmed)) throw new Error("WhatsApp phone must be a valid E.164 number");
  return trimmed.slice(1);
}

export function verifyWhatsAppSignature(rawBody: Buffer, signature: string | undefined, appSecret: string | undefined): boolean {
  if (!signature || !appSecret || !signature.startsWith("sha256=")) return false;
  const expected = Buffer.from("sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const provided = Buffer.from(signature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function hashWebhookEvent(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
