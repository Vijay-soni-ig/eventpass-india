import { Prisma } from "@prisma/client";
import { enqueueNotificationIntent } from "./notificationOutboxService";

type ReviewStatus = "approved" | "rejected";

async function loadParticipationContext(tx: Prisma.TransactionClient, participationId: string) {
  const participation = await tx.exhibitionExhibitor.findUnique({
    where: { id: participationId },
    select: {
      id: true,
      exhibition: { select: { id: true, name: true, organizerId: true } },
      business: { select: { companyName: true } },
    },
  });
  if (!participation) throw new Error("EXHIBITOR_PARTICIPATION_NOT_FOUND");
  return participation;
}

async function enqueueParticipationNotification(
  tx: Prisma.TransactionClient,
  params: {
    type: string;
    participationId: string;
    idempotencyKey: string;
    actorUserId: string | null;
    title: string;
    message: string;
    actionUrl: string;
    eventKey: string;
  },
): Promise<void> {
  const participation = await loadParticipationContext(tx, params.participationId);
  await enqueueNotificationIntent({
    eventKey: params.eventKey,
    idempotencyKey: params.idempotencyKey,
    eventType: params.type,
    entityType: "ExhibitionExhibitor",
    entityId: participation.id,
    actorUserId: params.actorUserId,
    payload: {
      organizerId: participation.exhibition.organizerId,
      exhibitionId: participation.exhibition.id,
      exhibitionName: participation.exhibition.name,
      companyName: participation.business.companyName ?? "An exhibitor",
      title: params.title,
      message: params.message,
      actionUrl: params.actionUrl,
    },
  }, tx);
}

export async function enqueueExhibitorApplicationSubmitted(tx: Prisma.TransactionClient, participationId: string, actorUserId: string): Promise<void> {
  const participation = await loadParticipationContext(tx, participationId);
  const companyName = participation.business.companyName?.trim() || "An exhibitor";
  await enqueueParticipationNotification(tx, {
    type: "EXHIBITOR_APPLICATION_SUBMITTED",
    participationId,
    idempotencyKey: `exhibitor-application:${participationId}:submitted:v1`,
    eventKey: `exhibitor-application-submitted:${participationId}`,
    actorUserId,
    title: "New exhibitor application",
    message: `${companyName} applied to participate in "${participation.exhibition.name}". Review the application in your organizer dashboard.`,
    actionUrl: `/organizer/exhibitions/${participation.exhibition.id}/applications`,
  });
}

export async function enqueueExhibitorApplicationReviewed(tx: Prisma.TransactionClient, participationId: string, status: ReviewStatus, actorUserId: string): Promise<void> {
  const participation = await loadParticipationContext(tx, participationId);
  const approved = status === "approved";
  await enqueueParticipationNotification(tx, {
    type: approved ? "EXHIBITOR_APPLICATION_APPROVED" : "EXHIBITOR_APPLICATION_REJECTED",
    participationId,
    idempotencyKey: `exhibitor-application:${participationId}:reviewed:${status}:v1`,
    eventKey: `exhibitor-application-reviewed:${participationId}:${status}`,
    actorUserId,
    title: approved ? "Application approved" : "Application not approved",
    message: approved
      ? `Your application for "${participation.exhibition.name}" has been approved. You can now reserve a stall.`
      : `Your application for "${participation.exhibition.name}" was not approved.`,
    actionUrl: "/exhibitor-dashboard/participations",
  });
}

async function enqueueStallPaymentNotification(tx: Prisma.TransactionClient, participationId: string, paymentId: string, actorUserId: string | null, outcome: "confirmed" | "failed"): Promise<void> {
  const participation = await loadParticipationContext(tx, participationId);
  const stall = await tx.stall.findFirst({ where: { exhibitionExhibitorId: participationId }, select: { code: true } });
  const stallLabel = stall?.code ? ` (stall ${stall.code})` : "";
  const confirmed = outcome === "confirmed";
  await enqueueParticipationNotification(tx, {
    type: confirmed ? "STALL_BOOKING_CONFIRMED" : "STALL_PAYMENT_FAILED",
    participationId,
    idempotencyKey: `stall-payment:${paymentId}:${outcome}:v1`,
    eventKey: `stall-payment:${outcome}:${paymentId}`,
    actorUserId,
    title: confirmed ? "Stall booking confirmed" : "Stall payment unsuccessful",
    message: confirmed
      ? `Your payment was verified and your booking for "${participation.exhibition.name}"${stallLabel} is confirmed.`
      : `Your payment for "${participation.exhibition.name}"${stallLabel} could not be completed. Your reservation is available for another payment attempt.`,
    actionUrl: "/exhibitor-dashboard/participations",
  });
}

export async function enqueueStallBookingConfirmed(tx: Prisma.TransactionClient, participationId: string, paymentId: string, actorUserId: string | null): Promise<void> {
  await enqueueStallPaymentNotification(tx, participationId, paymentId, actorUserId, "confirmed");
}

export async function enqueueStallPaymentFailed(tx: Prisma.TransactionClient, participationId: string, paymentId: string, actorUserId: string | null): Promise<void> {
  await enqueueStallPaymentNotification(tx, participationId, paymentId, actorUserId, "failed");
}
