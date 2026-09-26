import { prisma } from "./prisma";
import type { RenderedContent, SendResult } from "./notificationProviders";

const DEFAULT_GRAPH_VERSION = "v26.0";

function envKey(eventType: string): string {
  return "WHATSAPP_TEMPLATE_" + eventType.replace(/[^A-Z0-9]+/gi, "_").toUpperCase();
}

function getConfig(eventType: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env[envKey(eventType)];
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en_US";
  const graphVersion = process.env.WHATSAPP_GRAPH_API_VERSION ?? DEFAULT_GRAPH_VERSION;
  if (!token || !phoneNumberId || !templateName) return null;
  return { token, phoneNumberId, templateName, languageCode, graphVersion };
}

export async function sendWhatsApp(params: {
  recipientUserId: string;
  eventType: string;
  payload: Record<string, unknown>;
  content: RenderedContent;
  attempts: number;
  forceFailUntilAttempt?: number;
}): Promise<SendResult> {
  if (typeof params.forceFailUntilAttempt === "number" && params.attempts <= params.forceFailUntilAttempt) {
    return { success: false, error: "Simulated transient provider failure (test-only)" };
  }

  const consent = await prisma.whatsAppConsent.findUnique({ where: { userId: params.recipientUserId } });
  if (!consent || consent.status !== "OPTED_IN") return { success: false, error: "WhatsApp consent is not active" };

  const config = getConfig(params.eventType);
  if (!config) return { success: false, error: "WhatsApp provider/template is not configured for " + params.eventType };

  const rawParameters = params.payload.whatsappParameters;
  if (!Array.isArray(rawParameters) || !rawParameters.every((value) => typeof value === "string")) {
    return { success: false, error: "WhatsApp template parameters are missing or invalid" };
  }

  const response = await fetch("https://graph.facebook.com/" + config.graphVersion + "/" + config.phoneNumberId + "/messages", {
    method: "POST",
    headers: { Authorization: "Bearer " + config.token, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: consent.phoneE164,
      type: "template",
      template: {
        name: config.templateName,
        language: { code: config.languageCode },
        components: [{ type: "body", parameters: rawParameters.map((text) => ({ type: "text", text })) }],
      },
    }),
  });

  const data = await response.json().catch(() => null) as { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } } | null;
  if (!response.ok) {
    const providerError = data?.error?.code
      ? "Meta " + data.error.code + ": " + (data.error.message ?? "WhatsApp API error")
      : "WhatsApp API request failed";
    return { success: false, error: providerError };
  }

  const providerMessageId = data?.messages?.[0]?.id;
  if (!providerMessageId) return { success: false, error: "WhatsApp API returned no message id" };
  return { success: true, providerMessageId };
}
