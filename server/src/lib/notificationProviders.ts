import { prisma } from "./prisma";
import type { NotificationType } from "@prisma/client";

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
  if (!mockProviderAllowed()) {
    return { success: false, error: "Email provider is not configured: mock adapter is disabled in production" };
  }
  if (shouldSimulateFailure(params.attempts, params.forceFailUntilAttempt)) {
    return { success: false, error: "Simulated transient provider failure (mock email adapter, test-only)" };
  }
  const user = await prisma.user.findUnique({ where: { id: params.recipientUserId }, select: { email: true } });
  console.log(
    JSON.stringify({
      event: "notification_mock_email_sent",
      to: user?.email ?? params.recipientUserId,
      subject: params.content.title,
      body: params.content.body,
    }),
  );
  return { success: true, providerMessageId: `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
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
  if (!mockProviderAllowed()) {
    return { success: false, error: "Push provider is not configured: mock adapter is disabled in production" };
  }
  if (shouldSimulateFailure(params.attempts, params.forceFailUntilAttempt)) {
    return { success: false, error: "Simulated transient provider failure (mock push adapter, test-only)" };
  }
  console.log(
    JSON.stringify({
      event: "notification_mock_push_sent",
      to: params.recipientUserId,
      title: params.content.title,
      body: params.content.body,
    }),
  );
  return { success: true, providerMessageId: `mock-push-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
}
