import { enqueueNotificationIntent } from "./notificationOutboxService";
import { logAudit } from "./audit";

export type RegistrationNotificationType =
  | "REGISTRATION_SUBMITTED"
  | "REGISTRATION_CONFIRMED"
  | "REGISTRATION_CANCELLED";

export async function enqueueRegistrationNotification(params: {
  type: RegistrationNotificationType;
  registrationId: string;
  userId: string | null;
  eventId: string;
  eventTitle: string;
  status?: string;
  reactivated?: boolean;
  cancellationReason?: string | null;
  actorUserId?: string | null;
}): Promise<void> {
  if (!params.userId) return;

  // Deterministic operation identity: retries/repeated calls for the same
  // lifecycle state must not create duplicate durable intents.
  const sourceVersion = [
    params.type,
    params.status ?? "",
    params.reactivated ? "reactivated" : "normal",
    params.cancellationReason ?? "",
  ].join(":");
  const idempotencyKey = `registration:${params.registrationId}:${sourceVersion}`;

  const result = await enqueueNotificationIntent({
    eventKey: `registration:${params.type}:${params.registrationId}`,
    idempotencyKey,
    eventType: params.type,
    entityType: "EventRegistration",
    entityId: params.registrationId,
    actorUserId: params.actorUserId ?? null,
    payload: {
      userId: params.userId,
      eventId: params.eventId,
      eventTitle: params.eventTitle,
      title: params.type === "REGISTRATION_CONFIRMED"
        ? "Registration confirmed"
        : params.type === "REGISTRATION_CANCELLED"
          ? "Registration cancelled"
          : "Registration received",
      message: params.type === "REGISTRATION_CONFIRMED"
        ? `Your registration for "${params.eventTitle}" is confirmed.`
        : params.type === "REGISTRATION_CANCELLED"
          ? `Your registration for "${params.eventTitle}" has been cancelled.`
          : `Your registration for "${params.eventTitle}" has been received.`,
      actionUrl: `/event/${params.eventId}`,
      reactivated: Boolean(params.reactivated),
      cancellationReason: params.cancellationReason ?? null,\n      ...(params.type === "REGISTRATION_CONFIRMED" ? { whatsappParameters: [params.eventTitle] } : {}),
    },
  });

  if (result.created) {
    await logAudit({
      actorUserId: params.actorUserId ?? null,
      action: "notification.registration_enqueued",
      entityType: "EventRegistration",
      entityId: params.registrationId,
      metadata: { eventId: params.eventId, type: params.type },
    });
  }
}
