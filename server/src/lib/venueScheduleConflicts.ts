import type { Prisma, PrismaClient } from "@prisma/client";

export type VenueScheduleConflict = {
  kind: "availability" | "maintenance";
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Event dates are date-only, so a conflict covers the full UTC calendar-day
 * interval [startDate, endDate + 1 day). Only venue-wide blocks are checked.
 * Floor/space blocks require an explicit Event allocation model before they can
 * be treated as conflicts without incorrectly blocking events that use another
 * part of the venue.
 */
export async function findVenueScheduleConflicts(
  db: DbClient,
  venueId: string | null | undefined,
  startDate: Date | null | undefined,
  endDate: Date | null | undefined,
): Promise<VenueScheduleConflict[]> {
  if (!venueId || !startDate || !endDate) return [];

  const conflictStart = new Date(startDate);
  conflictStart.setUTCHours(0, 0, 0, 0);
  const conflictEnd = new Date(endDate);
  conflictEnd.setUTCHours(0, 0, 0, 0);
  conflictEnd.setUTCDate(conflictEnd.getUTCDate() + 1);

  const [availability, maintenance] = await Promise.all([
    db.venueAvailabilityBlock.findMany({
      where: {
        venueId,
        floorId: null,
        spaceId: null,
        status: { in: ["active", "inactive"] },
        type: { in: ["closed", "reserved", "unavailable"] },
        startsAt: { lt: conflictEnd },
        endsAt: { gt: conflictStart },
      },
      select: { id: true, name: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    }),
    db.venueMaintenanceBlock.findMany({
      where: {
        venueId,
        floorId: null,
        spaceId: null,
        status: { in: ["scheduled", "in_progress"] },
        startsAt: { lt: conflictEnd },
        endsAt: { gt: conflictStart },
      },
      select: { id: true, title: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return [
    ...availability.map((block) => ({
      kind: "availability" as const,
      id: block.id,
      name: block.name,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
    })),
    ...maintenance.map((block) => ({
      kind: "maintenance" as const,
      id: block.id,
      name: block.title,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
    })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function venueScheduleConflictMessage(conflicts: VenueScheduleConflict[]): string {
  const labels = conflicts.slice(0, 3).map((conflict) => `${conflict.kind === "maintenance" ? "maintenance" : "availability"} "${conflict.name}"`);
  const suffix = conflicts.length > 3 ? ` and ${conflicts.length - 3} more` : "";
  return `The selected venue has a venue-wide scheduling conflict during this event: ${labels.join(", ")}${suffix}.`;
}
