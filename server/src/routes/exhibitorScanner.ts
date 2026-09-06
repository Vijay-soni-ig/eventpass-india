import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitionIdsForConfirmedExhibitor } from "../lib/access";

// ---------------------------------------------------------------------------
// Phase 21B — exhibitor-side gate scanner (P0-3 fix).
//
// Mirrors the organizer scanner's lookup/check-in behavior in
// routes/bookings.ts (same payment-status gate, same duplicate gate, same
// override gate) but scoped to a completely different tenant axis: an
// exhibitor may look up or check in a ticket only for an exhibition where
// their own exhibitor business has a CONFIRMED ExhibitionExhibitor
// participation (see exhibitionIdsForConfirmedExhibitor). This is never
// mixed with organizerIdsWithPermission/OrganizerMembership — a pure
// exhibitor account gains zero organizer access from this router.
// ---------------------------------------------------------------------------

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

const checkInInclude = {
  checkIns: {
    orderBy: { scannedAt: "desc" as const },
    take: 1,
    include: { scannedByUser: { select: { fullName: true, email: true } } },
  },
};

router.get("/lookup/:qrCode", async (req, res) => {
  const exhibitionIds = await exhibitionIdsForConfirmedExhibitor(req.user!, "scanner:use");
  const booking = exhibitionIds.length
    ? await prisma.ticketBooking.findFirst({
        where: { qrCode: req.params.qrCode, exhibitionId: { in: exhibitionIds } },
        include: { exhibition: true, ticketType: true, ...checkInInclude },
      })
    : null;
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json({ booking });
});

const checkInSchema = z.object({
  // Re-entry/correction on a ticket that's already checked in. Requires
  // checkin:override (exhibitor owner/admin only) — plain staff cannot
  // self-authorize a duplicate check-in just by retrying.
  force: z.boolean().optional(),
});

router.patch("/tickets/:id/check-in", async (req, res) => {
  const exhibitionIds = await exhibitionIdsForConfirmedExhibitor(req.user!, "scanner:use");
  const booking = exhibitionIds.length
    ? await prisma.ticketBooking.findFirst({
        where: { id: req.params.id, exhibitionId: { in: exhibitionIds } },
        include: checkInInclude,
      })
    : null;
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const parsed = checkInSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  if (booking.paymentStatus !== "paid") {
    return res.status(400).json({ error: "This ticket has not been paid for and cannot be checked in" });
  }

  const alreadyCheckedIn = booking.checkInStatus;

  if (alreadyCheckedIn && !parsed.data.force) {
    return res.status(409).json({
      error: "This ticket has already been checked in",
      lastCheckIn: booking.checkIns[0] ?? null,
    });
  }

  if (alreadyCheckedIn && parsed.data.force) {
    const overrideIds = await exhibitionIdsForConfirmedExhibitor(req.user!, "checkin:override");
    if (!overrideIds.includes(booking.exhibitionId)) {
      return res.status(403).json({ error: "Re-entry after a duplicate check-in requires owner/admin authorization" });
    }
  }

  // Conditional update: only actually transitions checkInStatus false -> true
  // when this is the first check-in, closing the same race window a
  // concurrent double-scan would otherwise hit. A force re-entry always
  // proceeds (it's explicitly re-affirming an already-true state).
  const result = await prisma.$transaction(async (tx) => {
    if (!alreadyCheckedIn) {
      const claimed = await tx.ticketBooking.updateMany({
        where: { id: booking.id, checkInStatus: false },
        data: { checkInStatus: true, checkInTime: new Date() },
      });
      if (claimed.count === 0) throw new Error("RACE_ALREADY_CHECKED_IN");
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
    return { booking: updatedBooking, checkIn };
  }).catch((err) => {
    if (err instanceof Error && err.message === "RACE_ALREADY_CHECKED_IN") return null;
    throw err;
  });

  if (!result) {
    return res.status(409).json({ error: "This ticket was just checked in by another scan" });
  }

  res.json({ booking: result.booking, checkIn: result.checkIn, wasOverride: alreadyCheckedIn });
});

export default router;
