import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { applyPaymentOutcome } from "../lib/paymentService";
import { getPaymentProvider } from "../lib/payments";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

// List payments for stall bookings across the caller's organizer(s).
router.get("/", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:view");
  const exhibitionId = req.query.exhibitionId as string | undefined;
  const bookings = organizerIds.length
    ? await prisma.stallBooking.findMany({
        where: {
          exhibition: { organizerId: { in: organizerIds } },
          ...(exhibitionId ? { exhibitionId } : {}),
        },
        include: { payment: true, stall: true, exhibition: true, exhibitionExhibitor: { include: { business: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ bookings });
});

/**
 * Manual payment reconciliation — records that money has actually been
 * received (e.g. bank transfer) outside the gateway. Deliberately NOT
 * reachable by the exhibitor/payer: only organizer roles with
 * payment:manage (owner/admin/finance) can call it, and it never accepts a
 * "just trust me, I paid" input from whoever initiated the payment — it's a
 * separate, permissioned action taken by the money side. It reuses the
 * exact same applyPaymentOutcome transition a verified webhook would use,
 * so the effect on the booking/stall/participation is identical either way.
 */
const markPaymentSchema = z.object({
  status: z.enum(["paid", "failed", "cancelled"]),
  gateway: z.string().optional(),
  gatewayRefId: z.string().optional(),
});

router.patch("/:paymentId", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to manage payments" });
  }

  const parsed = markPaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const booking = await prisma.stallBooking.findFirst({
    where: { paymentId: req.params.paymentId, exhibition: { organizerId: { in: organizerIds } } },
    include: { payment: true },
  });
  if (!booking || !booking.payment) return res.status(404).json({ error: "Payment not found" });
  if (booking.payment.status === "paid" || booking.payment.status === "refunded") {
    return res.status(400).json({ error: `Payment is already ${booking.payment.status}` });
  }

  const result = await applyPaymentOutcome(booking.payment.id, parsed.data.status);
  if (!result.applied) return res.status(409).json({ error: "Payment could not be updated" });

  if (parsed.data.gateway || parsed.data.gatewayRefId) {
    await prisma.payment.update({
      where: { id: booking.payment.id },
      data: { gateway: parsed.data.gateway ?? "manual", gatewayRefId: parsed.data.gatewayRefId },
    });
  }

  const payment = await prisma.payment.findUnique({ where: { id: booking.payment.id } });
  res.json({ payment });
});

/**
 * Refund-ready: issues a refund through the configured provider (real
 * Razorpay refund API when configured; the mock provider marks it "pending"
 * for manual follow-up rather than pretending money moved). Only reachable
 * for a payment that has actually been marked "paid".
 */
router.post("/:paymentId/refund", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "payment:manage");
  if (organizerIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to manage payments" });
  }

  const booking = await prisma.stallBooking.findFirst({
    where: { paymentId: req.params.paymentId, exhibition: { organizerId: { in: organizerIds } } },
    include: { payment: true },
  });
  if (!booking || !booking.payment) return res.status(404).json({ error: "Payment not found" });
  if (booking.payment.status !== "paid") {
    return res.status(400).json({ error: "Only a paid payment can be refunded" });
  }

  const provider = getPaymentProvider();
  if (!booking.payment.providerPaymentId) {
    return res.status(400).json({ error: "This payment has no provider payment id to refund against" });
  }

  const refund = await provider.refund(booking.payment.providerPaymentId, Number(booking.payment.amount));

  // A provider that can't actually move money yet (mock, or a real gateway
  // returning a pending/async refund) doesn't get to claim "refunded" —
  // only a provider-confirmed "processed" outcome does.
  if (refund.status === "processed") {
    await applyPaymentOutcome(booking.payment.id, "refunded");
  }

  const payment = await prisma.payment.findUnique({ where: { id: booking.payment.id } });
  res.json({ payment, refund });
});

export default router;
