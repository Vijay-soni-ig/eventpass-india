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

/**
 * IN_APP delivery writes into the existing `notifications` table (Phase 22/26
 * model) so it's picked up by the bell/list UI (src/components/notifications)
 * that already reads from it — no new frontend surface needed.
 *
 * Idempotent by construction: the table's existing
 * @@unique([userId, entityId, type, sourceVersion]) constraint is reused with
 * sourceVersion set to the INTENT id by the caller, so re-processing the same
 * intent (a retry after a crash, a duplicate claim that somehow got through)
 * can never create a second in-app notification for the same event.
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
 * Mock/no-op EMAIL adapter. No real email provider is configured anywhere in
 * this stack (no SMTP/SendGrid credentials exist in .env.example or the
 * production compose file) — this logs the would-be send and reports success,
 * proving the pipeline shape end to end without claiming to actually deliver
 * anything. Wire a real provider here once credentials exist; callers
 * (notificationDispatcher.ts) don't need to change.
 *
 * `forceFailUntilAttempt` exists purely for deterministic testing: when set,
 * every attempt at or below that number fails, so a test can drive a real
 * retry-then-succeed sequence without mocking modules.
 */
export async function sendEmail(params: {
  recipientUserId: string;
  content: RenderedContent;
  attempts: number;
  forceFailUntilAttempt?: number;
}): Promise<SendResult> {
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

/** Mock/no-op PUSH adapter — same rationale and test hook as sendEmail above; no FCM/APNs credentials exist anywhere in this stack. */
export async function sendPush(params: {
  recipientUserId: string;
  content: RenderedContent;
  attempts: number;
  forceFailUntilAttempt?: number;
}): Promise<SendResult> {
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
