import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { exhibitorBusinessIdsWithPermission, hasAnyExhibitorMembership } from "../lib/access";
import { resolveExhibitorBusinessId } from "../lib/exhibitorBusiness";
import { createOrderForPayment, applyPaymentOutcome } from "../lib/paymentService";
import { getPublishedFloorPlan } from "../lib/floorPlanQueries";
import { lockStallForUpdate, expireStallIfEligible, recordReservationExpiryAudit, releaseExpiredReservations } from "../lib/stallReservationExpiry";
import { exhibitorParticipationMutationRateLimit, exhibitorStallReservationRateLimit, exhibitorPaymentMutationRateLimit } from "../middleware/rateLimit";

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
          exhibition: {
            include: {
              event: {
                select: {
                  id: true, title: true, description: true, categoryId: true,
                  coverImageUrl: true, venue: true, city: true, latitude: true, longitude: true,
                  startDate: true, endDate: true, status: true, visibility: true,
                  refundPolicy: true, terms: true, timezone: true,
                },
              },
            },
          },
          stalls: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const canonicalParticipations = participations.map((participation) => {
    const event = participation.exhibition.event;
    if (!event) return participation;
    return {
      ...participation,
      exhibition: {
        ...participation.exhibition,
        eventId: event.id,
        name: event.title,
        description: event.description,
        category: event.categoryId ?? participation.exhibition.category,
        coverImageUrl: event.coverImageUrl,
        venue: event.venue,
        city: event.city,
        latitude: event.latitude,
        longitude: event.longitude,
        startDate: event.startDate,
        endDate: event.endDate,
        status: event.status === "DRAFT" ? "draft" : event.status === "PUBLISHED" ? "live" : event.status === "PAUSED" ? "paused" : event.status === "COMPLETED" ? "completed" : event.status.toLowerCase(),
        visibility: event.visibility,
        refundPolicy: event.refundPolicy,
        terms: event.terms,
        timezone: event.timezone,
      },
    };
  });
  res.json({ participations: canonicalParticipations });
});

// -------- 1. Apply to an exhibition --------

const applySchema = z.object({ exhibitionId: z.string() });

router.post("/", exhibitorParticipationMutationRateLimit, async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await prisma.exhibition.findFirst({
    where: {
      id: parsed.data.exhibitionId,
      OR: [
        { event: { status: "PUBLISHED", visibility: "public", archivedAt: null } },
        { eventId: null, status: "live", visibility: "public" },
      ],
    },
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
  // A findUnique-then-create here would leave a TOCTOU window: two
  // concurrent applications for the same (exhibitionId, exhibitorBusinessId)
  // could both pass the pre-check and both attempt to create, and the loser
  // would hit the DB's unique constraint as a raw, uncaught error. The
  // findUnique below is kept only as a fast, friendly path for the by far
  // most common (non-racing) case — it saves a wasted insert attempt and