  });

  res.json({ participants });
});

router.get("/exhibitions/:id", publicReadRateLimit, async (req, res) => {
  // Phase 30 (FP-05): release any expired reservation before reading stalls
  // below — this query filters to status:"available" only, so an expired-
  // but-not-yet-released reservation would otherwise stay invisible here
  // even after its 1-hour window has passed.
  await releaseExpiredReservations(req.params.id);

  // 001E: Event owns the universal public identity/lifecycle. Exhibition
  // remains the operational/content payload (ticket types, stalls, schedules,
  // media, FAQs, etc.). Legacy unlinked Exhibitions intentionally fall back
  // to their own lifecycle so old records remain reachable.
  const event = await prisma.event.findFirst({
    where: {
      exhibition: { id: req.params.id },
    },
    include: {
      organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
      exhibition: {
        include: {
          ticketTypes: { where: { visible: true } },
          stalls: { where: { status: "available" }, select: { id: true, code: true, stallType: true, size: true, price: true, status: true, posX: true, posY: true, width: true, height: true } },
          media: { where: { active: true }, orderBy: { sortOrder: "asc" } },
          schedules: { where: { active: true }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
          highlights: { where: { active: true }, orderBy: { sortOrder: "asc" } },
          audiences: { where: { active: true }, orderBy: { sortOrder: "asc" } },
          faqs: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  let exhibition = event?.exhibition ?? null;
  if (event && exhibition && (event.status === "PUBLISHED" || event.status === "COMPLETED") && event.visibility === "public" && event.archivedAt === null) {
    const statusMap = { PUBLISHED: "live", COMPLETED: "completed" } as const;
    exhibition = {
      ...exhibition,
      organizer: event.organizer,
      name: event.title,
      description: event.description,
      venue: event.venue,
      city: event.city,
      latitude: event.latitude,
      longitude: event.longitude,
      startDate: event.startDate,
      endDate: event.endDate,
      coverImageUrl: event.coverImageUrl,
      refundPolicy: event.refundPolicy,
      terms: event.terms,
      status: statusMap[event.status],
      visibility: event.visibility,
    };
  } else if (event) {
    // A linked Event is authoritative: never fall back to the legacy
    // Exhibition lifecycle when the Event itself is not publicly reachable.
    exhibition = null;
  } else {
    exhibition = await prisma.exhibition.findFirst({
      where: { id: req.params.id, status: { in: ["live", "completed"] }, visibility: "public" },
      include: {
        organizer: { select: { id: true, name: true, slug: true, logoUrl: true, kycStatus: true } },
        ticketTypes: { where: { visible: true } },
        stalls: { where: { status: "available" }, select: { id: true, code: true, stallType: true, size: true, price: true, status: true, posX: true, posY: true, width: true, height: true } },
        media: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        schedules: { where: { active: true }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }] },
        highlights: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        audiences: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        faqs: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      },
    });
  }
