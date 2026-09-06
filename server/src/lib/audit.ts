import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Records an entry in the cross-cutting audit trail. Never throws into the
 * caller's request — an audit-log failure should not fail the underlying
 * action, but it is logged to the console so it isn't silently lost.
 */
export async function logAudit(params: {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
