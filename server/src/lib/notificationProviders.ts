import { prisma } from "./prisma";
import type { NotificationType } from "@prisma/client";
import webpush from "web-push";

export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface RenderedContent {
  title: string;
  body: string;
  actionUrl: string;
}

function shouldSimulateFailure(attempts: number, forceFailUntilAttempt?: number): boolean {
  return typeof forceFailUntilAttempt === "number" && attempts <= forceFailUntilAttempt;
}

function mockProviderAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * IN_APP delivery writes into the existing `notifications` table (Phase 22/26
 * model) so it is picked up by the bell/list UI. No external provider is
 * required for this channel.
 *
 * Idempotent by construction: the table's existing
 * @@unique([userId, entityId, type, sourceVersion]) constraint is reused with
 * sourceVersion set to the INTENT id by the caller, so re-processing the same
 * intent cannot create a second in-app notification for the same delivery.
 */
export async function sendInApp(params: {
  recipientUserId: string;
  notificationType: NotificationType;
  entityType: string;
  entityId: string;
  sourceVersion: string;
  content: RenderedContent;
  organizerId?: string | null;
}): Promise<SendResult> {
  try {
    await prisma.notification.upsert({
      where: {
        userId_entityId_type_sourceVersion: {
          userId: params.recipientUserId,
          entityId: params.entityId,
          type: params.notificationType,
          sourceVersion: params.sourceVersion,
        },
      },
      create: {
        userId: params.recipientUserId,
        type: params.notificationType,
        title: params.content.title,
        message: params.content.body,
        entityType: params.entityType,
        entityId: params.entityId,
        actionUrl: params.content.actionUrl,
        organizerId: params.organizerId ?? null,
        sourceVersion: params.sourceVersion,
      },
      update: {},
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown in-app delivery error" };
  }
}

/**
 * Mock/no-op EMAIL adapter. A real provider must be wired before production
 * email delivery is enabled. The mock adapter deliberately fails closed in
 * production so an unconfigured deployment cannot record a fake successful
 * email delivery.
 *
 * `forceFailUntilAttempt` exists only for deterministic non-production tests.
 */
export async function sendEmail(params: {
  recipientUserId: string;
  content: RenderedContent;
  attempts: number;
  forceFailUntilAttempt?: number;
}): Promise<SendResult> {
  if (shouldSimulateFailure(params.attempts, params.forceFailUntilAttempt)) {
    return { success: false, error: "Simulated transient provider failure (test-only)" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NOTIFICATION_EMAIL_PROVIDER === "mock" && process.env.NODE_ENV !== "production") {
      const user = await prisma.user.findUnique({
        where: { id: params.recipientUserId },
        select: { email: true },
      });
      if (!user?.email) return { success: false, error: "Recipient email address is unavailable" };
      return {
        success: true,
        providerMessageId: `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      };
    }
    return { success: false, error: "Email provider is not configured" };
  }

  const user = await prisma.user.findUnique({
    where: { id: params.recipientUserId },
    select: { email: true },
  });
  if (!user?.email) return { success: false, error: "Recipient email address is unavailable" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: params.content.title,
        text: `${params.content.body}\n\nView in ExhibitTix: ${params.content.actionUrl}`,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) return { success: false, error: body.message ?? "Email provider rejected the notification" };
    return { success: true, providerMessageId: body.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Email delivery failed" };
  }
}

/**
 * Mock/no-op PUSH adapter. A real provider must be wired before production
 * push delivery is enabled. The mock adapter deliberately fails closed in
 * production for the same reason as the email adapter.
 */
export async function sendPush(params: {
  recipientUserId: string;
  content: RenderedContent;
  attempts: number;
  forceFailUntilAttempt?: number;
}): Promise<SendResult> {
  if (shouldSimulateFailure(params.attempts, params.forceFailUntilAttempt)) {
    return { success: false, error: "Simulated transient provider failure (test-only)" };
  }

  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) {
    return { success: false, error: "Push provider is not configured" };
  }

  const subscriptions = await prisma.notificationPushSubscription.findMany({
    where: { userId: params.recipientUserId, revokedAt: null },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) {
    return { success: true, providerMessageId: "web-push-no-active-subscription" };
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const payload = JSON.stringify({
    title: params.content.title,
    body: params.content.body,
    url: params.content.actionUrl,
  });

  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      const response = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        { TTL: 86400, urgency: "normal", contentEncoding: "aes128gcm" },
      );
      await prisma.notificationPushSubscription.updateMany({
        where: { id: subscription.id, revokedAt: null },
        data: { lastUsedAt: new Date() },
      });
      return { success: true, id: response.headers?.location ?? subscription.id };
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : undefined;

      if (statusCode === 404 || statusCode === 410) {
        await prisma.notificationPushSubscription.updateMany({
          where: { id: subscription.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { success: false, gone: true, error: "Push subscription expired or was rejected by the push service" };
      }

      return {
        success: false,
        gone: false,
        error: error instanceof Error ? error.message : "Push delivery failed",
      };
    }
  }));

  const delivered = results.filter((result) => result.success);
  const activeFailures = results.filter((result) => !result.success && !result.gone);
  if (delivered.length > 0) {
    return {
      success: true,
      providerMessageId: delivered.map((result) => result.id).join(",").slice(0, 500),
    };
  }
  if (activeFailures.length === 0) {
    return { success: true, providerMessageId: "web-push-no-active-subscription" };
  }
  return { success: false, error: activeFailures.map((result) => result.error).join("; ").slice(0, 1000) };
}
