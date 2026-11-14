import { Router } from "express";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, isPlatformAdmin } from "../lib/access";
import { can, exhibitorRoleToRole } from "../lib/permissions";
import { exhibitorScannerMutationRateLimit } from "../middleware/rateLimit";
import { canCheckInForExhibitionStatus } from "../lib/scannerEligibility";

const router = Router();
router.use(requireAuth, requireExhibitorBusinessAccess);

const checkInInclude = {
  checkIns: {
    orderBy: { scannedAt: "desc" as const },
    take: 1,
    include: { scannedByUser: { select: { fullName: true, email: true } } },
  },
};

type ScannerAccess = {
  exhibitionIds: string[];
  canOverride: boolean;
};

/**
 * Keep exhibitor scanner authorization valid through the protected read/write.
 * Team membership mutations take the same exhibitor-business row lock; locking
 * confirmed participation rows also serializes organizer approval/revocation.
 * This prevents a revoked/demoted member or withdrawn exhibitor from using a
 * stale permission snapshot to read visitor PII or check in tickets.
 */
async function withScannerAccess<T>(
  user: User,
  operation: (tx: Prisma.TransactionClient, access: ScannerAccess) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const platformAdmin = isPlatformAdmin(user);
    const initiallyAuthorizedBusinessIds = platformAdmin
      ? []
      : await exhibitorBusinessIdsWithPermission(user, "scanner:use");
    if (!platformAdmin && initiallyAuthorizedBusinessIds.length === 0) return null;

    let businessIds = initiallyAuthorizedBusinessIds;
    let canOverride = platformAdmin;

    if (!platformAdmin) {
      businessIds = [...new Set(businessIds)].sort();
      await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" IN (${Prisma.join(businessIds)}) ORDER BY "id" FOR UPDATE`;
      const memberships = await tx.exhibitorMembership.findMany({
        where: {
          exhibitorBusinessId: { in: businessIds },
          userId: user.id,
          status: "active",
          business: { suspended: false },
        },
        select: { exhibitorBusinessId: true, role: true },
      });
      const scannerMemberships = memberships.filter((membership) =>
        can(exhibitorRoleToRole(membership.role), "scanner:use"),
      );
      businessIds = scannerMemberships.map((membership) => membership.exhibitorBusinessId);
      canOverride = scannerMemberships.some((membership) =>
        can(exhibitorRoleToRole(membership.role), "checkin:override"),
      );
      if (businessIds.length === 0) return null;
    }

    const participations = await tx.exhibitionExhibitor.findMany({
      where: {
        ...(platformAdmin ? {} : { exhibitorBusinessId: { in: businessIds } }),
        status: "confirmed",
      },
      select: { id: true, exhibitionId: true },
    });
    if (participations.length > 0) {
      const participationIds = participations.map((participation) => participation.id).sort();
      await tx.$queryRaw`SELECT "id" FROM "exhibition_exhibitors" WHERE "id" IN (${Prisma.join(participationIds)}) ORDER BY "id" FOR SHARE`;
    }
    // Re-read after acquiring the row locks: an organizer may have changed a
    // participation while this request was waiting for its lock.
    const confirmedParticipations = participations.length
      ? await tx.exhibitionExhibitor.findMany({
          where: { id: { in: participations.map((participation) => participation.id) }, status: "confirmed" },
          select: { exhibitionId: true },
        })
      : [];

    return operation(tx, {
      exhibitionIds: [...new Set(confirmedParticipations.map((participation) => participation.exhibitionId))],
      canOverride,
    });
  });
}

router.get("/lookup/:qrCode", async (req, res) => {
  const booking = await withScannerAccess(req.user!, async (tx, access) => {
    if (access.exhibitionIds.length === 0) return null;
    return tx.ticketBooking.findFirst({
      where: {
        qrCode: req.params.qrCode,
        exhibitionId: { in: access.exhibitionIds },
        exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] },
      },
      include: { exhibition: true, ticketType: true, ...checkInInclude },
    });
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json({ booking });
});

const checkInSchema = z.object({ force: z.boolean().optional() });

router.patch("/tickets/:id/check-in", exhibitorScannerMutationRateLimit, async (req, res) => {
  const parsed = checkInSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const result = await withScannerAccess(req.user!, async (tx, access) => {
    if (access.exhibitionIds.length === 0) return { kind: "not_found" as const };
    const where = {
      id: req.params.id,
      exhibitionId: { in: access.exhibitionIds },
      exhibition: { OR: [{ eventId: null }, { event: { archivedAt: null } }] },
    };
    const initial = await tx.ticketBooking.findFirst({ where, select: { id: true, paymentId: true } });
    if (!initial) return { kind: "not_found" as const };

    // Refund finalization takes the payment lock before changing ticket
    // paymentStatus. Use the same order, then lock the ticket row and re-read
    // its state so a refunded ticket cannot pass a stale pre-transaction read.
    if (initial.paymentId) {
      await tx.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${initial.paymentId} FOR UPDATE`;
    }
    await tx.$queryRaw`SELECT "id" FROM "ticket_bookings" WHERE "id" = ${initial.id} FOR UPDATE`;

    const booking = await tx.ticketBooking.findFirst({
      where,
      include: { ...checkInInclude, exhibition: { select: { status: true } } },
    });
    if (!booking) return { kind: "not_found" as const };
    if (!canCheckInForExhibitionStatus(booking.exhibition.status)) {
      return { kind: "unavailable" as const, status: booking.exhibition.status };
    }
    if (booking.paymentStatus !== "paid") return { kind: "unpaid" as const };

    const alreadyCheckedIn = booking.checkInStatus;
    if (alreadyCheckedIn && !parsed.data.force) {
      return { kind: "duplicate" as const, lastCheckIn: booking.checkIns[0] ?? null };
    }
    if (alreadyCheckedIn && parsed.data.force && !access.canOverride) {
      return { kind: "forbidden" as const };
    }

    if (!alreadyCheckedIn) {
      const claimed = await tx.ticketBooking.updateMany({
        where: { id: booking.id, checkInStatus: false, paymentStatus: "paid" },
        data: { checkInStatus: true, checkInTime: new Date() },
      });
      if (claimed.count !== 1) return { kind: "race" as const };
    }

    const checkIn = await tx.checkIn.create({
      data: {
        ticketBookingId: booking.id,
        scannedByUserId: req.user!.id,
        method: "qr",
        isOverride: alreadyCheckedIn,
      },
    });
    const updatedBooking = await tx.ticketBooking.findUniqueOrThrow({ where: { id: booking.id } });
    return { kind: "checked_in" as const, booking: updatedBooking, checkIn, wasOverride: alreadyCheckedIn };
  });

  if (!result) return res.status(404).json({ error: "Booking not found" });
  if (result.kind === "not_found") return res.status(404).json({ error: "Booking not found" });
  if (result.kind === "unavailable") return res.status(423).json({ error: `Check-in is unavailable while this exhibition is ${result.status}` });
  if (result.kind === "unpaid") return res.status(400).json({ error: "This ticket has not been paid for and cannot be checked in" });
  if (result.kind === "duplicate") return res.status(409).json({ error: "This ticket has already been checked in", lastCheckIn: result.lastCheckIn });
  if (result.kind === "forbidden") return res.status(403).json({ error: "Re-entry after a duplicate check-in requires owner/admin authorization" });
  if (result.kind === "race") return res.status(409).json({ error: "This ticket was just checked in by another scan" });

  res.json({ booking: result.booking, checkIn: result.checkIn, wasOverride: result.wasOverride });
});

export default router;
