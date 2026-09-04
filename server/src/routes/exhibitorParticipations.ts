import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, hasAnyExhibitorMembership } from "../lib/access";
import { resolveExhibitorBusinessId } from "../lib/exhibitorBusiness";
import { createOrderForPayment } from "../lib/paymentService";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

// "Exhibitions my business participates in" — the exhibitor-side mirror of
// organizer's exhibitions.ts. Access is scoped to ExhibitionExhibitor rows
// for businesses the caller has an active membership in; a business that
// hasn't applied to (or had an application approved for) an exhibition
// never appears.
router.get("/", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:view");
  const participations = businessIds.length
    ? await prisma.exhibitionExhibitor.findMany({
        where: { exhibitorBusinessId: { in: businessIds } },
        include: {
          exhibition: true,
          stalls: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ participations });
});

// -------- 1. Apply to an exhibition --------

const applySchema = z.object({ exhibitionId: z.string() });

router.post("/", async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await prisma.exhibition.findFirst({
    where: { id: parsed.data.exhibitionId, status: "live", visibility: "public" },
  });
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });

  // A brand-new exhibitor account (no business/membership yet) can still
  // apply — this bootstraps their ExhibitorBusiness as "owner", mirroring
  // the same first-use pattern already used for organizer creation and
  // business-profile setup elsewhere in the API. A user who already has a
  // membership but the wrong role (e.g. staff) is denied outright, never
  // silently handed a second, brand-new business as a side-channel.
  const manageableIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  let businessId: string;
  if (manageableIds.length > 0) {
    businessId = manageableIds[0];
  } else if (await hasAnyExhibitorMembership(req.user!.id)) {
    return res.status(403).json({ error: "You do not have permission to apply on behalf of your exhibitor business" });
  } else {
    businessId = await resolveExhibitorBusinessId(req.user!.id);
  }
  const existing = await prisma.exhibitionExhibitor.findUnique({
    where: { exhibitionId_exhibitorBusinessId: { exhibitionId: exhibition.id, exhibitorBusinessId: businessId } },
  });
  if (existing) return res.status(409).json({ error: "You have already applied to this exhibition" });

  const participation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId: exhibition.id, exhibitorBusinessId: businessId, status: "applied" },
  });
  res.status(201).json({ participation });
});

// -------- 3. Withdraw / cancel a participation --------

router.patch("/:id/cancel", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const existing = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
      })
    : null;
  if (!existing) return res.status(404).json({ error: "Participation not found" });
  if (existing.status === "cancelled" || existing.status === "rejected") {
    return res.status(400).json({ error: `Cannot cancel a participation that is already ${existing.status}` });
  }

  const participation = await prisma.$transaction(async (tx) => {
    // Release any stall this participation was holding, back to available.
    await tx.stall.updateMany({
      where: { exhibitionExhibitorId: existing.id },
      data: { exhibitionExhibitorId: null, status: "available" },
    });
    return tx.exhibitionExhibitor.update({ where: { id: existing.id }, data: { status: "cancelled" } });
  });
  res.json({ participation });
});

// -------- 4/5. Select & reserve a stall (only once approved) --------

const selectStallSchema = z.object({ stallId: z.string() });

router.post("/:id/stall", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const participation = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
      })
    : null;
  if (!participation) return res.status(404).json({ error: "Participation not found" });
  if (participation.status !== "approved") {
    return res.status(400).json({ error: "Your application must be approved before selecting a stall" });
  }

  const parsed = selectStallSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const stall = await tx.stall.findFirst({
        where: { id: parsed.data.stallId, exhibitionId: participation.exhibitionId },
      });
      if (!stall) throw new Error("STALL_NOT_FOUND");

      // Conditional update guards against a concurrent request reserving the
      // same stall between the read above and this write (the TOCTOU race
      // the original single-buyer stall-booking endpoint was vulnerable to).
      const claimed = await tx.stall.updateMany({
        where: { id: stall.id, status: "available" },
        data: { status: "reserved", exhibitionExhibitorId: participation.id },
      });
      if (claimed.count === 0) throw new Error("STALL_UNAVAILABLE");

      const updatedParticipation = await tx.exhibitionExhibitor.updateMany({
        where: { id: participation.id, status: "approved" },
        data: { status: "stall_reserved" },
      });
      if (updatedParticipation.count === 0) throw new Error("PARTICIPATION_CHANGED");

      return tx.exhibitionExhibitor.findUniqueOrThrow({
        where: { id: participation.id },
        include: { stalls: true },
      });
    });
    res.json({ participation: result });
  } catch (err) {
    if (err instanceof Error && err.message === "STALL_NOT_FOUND") {
      return res.status(404).json({ error: "Stall not found" });
    }
    if (err instanceof Error && (err.message === "STALL_UNAVAILABLE" || err.message === "PARTICIPATION_CHANGED")) {
      return res.status(409).json({ error: "That stall was just taken by someone else. Please pick another." });
    }
    throw err;
  }
});

// -------- 6. Initiate payment for the reserved stall --------
//
// Creates a real gateway order (Payment status "created") and a StallBooking
// linked to it. Nothing here ever marks the payment paid — that only ever
// happens via a verified checkout signature (POST /api/payments/:id/verify)
// or the gateway's webhook (POST /api/webhooks/payments/:provider), both of
// which route through the same applyPaymentOutcome transition.
router.post("/:id/payment", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:manage");
  const participation = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
        include: { stalls: true },
      })
    : null;
  if (!participation) return res.status(404).json({ error: "Participation not found" });
  if (participation.status !== "stall_reserved") {
    return res.status(400).json({ error: "Select and reserve a stall before starting payment" });
  }

  const stall = participation.stalls[0];
  if (!stall) return res.status(400).json({ error: "No reserved stall found for this participation" });

  const existingPending = await prisma.stallBooking.findFirst({
    where: { exhibitionExhibitorId: participation.id, payment: { status: { in: ["created", "pending"] } } },
    include: { payment: true },
  });
  if (existingPending) {
    return res.status(200).json({ booking: existingPending, payment: existingPending.payment });
  }

  const { payment, order } = await createOrderForPayment({
    amount: Number(stall.price),
    notes: { exhibitionExhibitorId: participation.id, stallId: stall.id, buyerUserId: req.user!.id },
  });

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.stallBooking.create({
      data: {
        stallId: stall.id,
        exhibitionId: participation.exhibitionId,
        exhibitionExhibitorId: participation.id,
        buyerUserId: req.user!.id,
        amountPaid: stall.price,
        paymentStatus: "created",
        paymentId: payment.id,
      },
    });
    await tx.exhibitionExhibitor.updateMany({
      where: { id: participation.id, status: "stall_reserved" },
      data: { status: "payment_pending" },
    });
    return created;
  });

  res.status(201).json({ booking, payment, order });
});

// -------- 10. Payment history for a participation --------

router.get("/:id/payments", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitionExhibitor:view");
  const participation = businessIds.length
    ? await prisma.exhibitionExhibitor.findFirst({
        where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } },
      })
    : null;
  if (!participation) return res.status(404).json({ error: "Participation not found" });

  const bookings = await prisma.stallBooking.findMany({
    where: { exhibitionExhibitorId: participation.id },
    include: { payment: true, stall: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ bookings });
});

export default router;
