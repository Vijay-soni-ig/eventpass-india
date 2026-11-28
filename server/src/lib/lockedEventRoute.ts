import type { Request, Response } from "express";
import type { Prisma, EventModule } from "@prisma/client";
import { withLockedEventAccess } from "./lockedEventAccess";

/**
 * Express adapter around withLockedEventAccess for Event-scoped organizer
 * routes. The handler body runs inside the transaction that holds the owning
 * organizer row lock, with the Event and the caller's active membership /
 * permission re-read under it, so authorization cannot go stale between the
 * check and the write.
 *
 * The body must not touch `res`. It returns a `Reply`; the adapter sends it
 * only after the transaction has committed, then runs `after` (audit logging)
 * outside the transaction.
 */
export type Reply = {
  status: number;
  body?: unknown;
  after?: () => Promise<void>;
};

export const reply = (status: number, body?: unknown, after?: () => Promise<void>): Reply => ({ status, body, after });

type EventPermission = Parameters<typeof withLockedEventAccess>[2];
type Ctx = { tx: Prisma.TransactionClient; event: { id: string; organizerId: string }; req: Request };

export function lockedEventRoute(permission: EventPermission, work: (ctx: Ctx) => Promise<Reply>) {
  return async (req: Request, res: Response) => {
    const result = await withLockedEventAccess(req.params.eventId, req.user!, permission, (tx, event) => work({ tx, event, req }));
    if (!result) return res.status(404).json({ error: "Event not found" });
    if (result.after) await result.after();
    if (result.status === 204) return res.status(204).send();
    return res.status(result.status).json(result.body);
  };
}

/** True when the module is enabled for the Event (read inside the lock). */
export async function moduleEnabled(tx: Prisma.TransactionClient, eventId: string, moduleType: EventModule) {
  const row = await tx.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}
