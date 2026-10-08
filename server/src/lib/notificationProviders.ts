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


export async function sendTeamInvitationEmail(params: {
  recipientEmail: string;
  organizationName: string;
  role: string;
  invitationUrl: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      return { success: false, error: "Email provider is not configured" };
    }
    console.log(JSON.stringify({
      event: "team_invitation_mock_email",
      to: params.recipientEmail,
      organizationName: params.organizationName,
      role: params.role,
      invitationUrl: params.invitationUrl,
    }));
    return { success: true, providerMessageId: `mock-team-invite-${Date.now()}` };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [params.recipientEmail],
        subject: `You're invited to join ${params.organizationName} on ExhibitTix`,
        html: `<p>You have been invited to join <strong>${params.organizationName}</strong> as <strong>${params.role}</strong>.</p><p><a href="${params.invitationUrl}">Accept invitation</a></p><p>This invitation expires in 7 days.</p>`,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string; id?: string };
    if (!response.ok) return { success: false, error: body?.message ?? "Email provider rejected the invitation" };
    return { success: true, providerMessageId: body?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Email delivery failed" };
  }
}
