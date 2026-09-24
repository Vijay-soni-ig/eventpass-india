import type { EventModule, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function isEventModuleEnabled(eventId: string, moduleType: EventModule, db: typeof prisma | Prisma.TransactionClient = prisma): Promise<boolean> {
  const row = await db.eventModuleEnablement.findUnique({
    where: { eventId_moduleType: { eventId, moduleType } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

export async function assertEventModuleEnabled(eventId: string, moduleType: EventModule, db: typeof prisma | Prisma.TransactionClient = prisma): Promise<void> {
  if (!(await isEventModuleEnabled(eventId, moduleType, db))) {
    throw new EventModuleDisabledError(moduleType);
  }
}

export class EventModuleDisabledError extends Error {
  constructor(public readonly moduleType: EventModule) {
    super(`The ${moduleType} module is not enabled for this event`);
  }
}
