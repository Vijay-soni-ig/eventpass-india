  const linkedEvents = await prisma.event.findMany({
    where: { organizerId: orgA.organizerId, eventType: "EXHIBITION" },
    select: { id: true, status: true, visibility: true, archivedAt: true },
  });
  const canonicalLiveEvents = linkedEvents.filter(
    (event) =>
      (event.status === "PUBLISHED" || event.status === "COMPLETED") &&
      event.visibility === "public" &&
      event.archivedAt === null,
  );
  assert.ok(canonicalLiveEvents.length >= 2);
  assert.equal(beforeBody.organizer._count.events, canonicalLiveEvents.length);

  await prisma.event.update({ where: { id: canonicalLiveEvents[0].id }, data: { status: "DRAFT" } });

  const after = await fetch(`${baseUrl}/api/public/organizers/disc-org-a-${ts}`);
  assert.equal(after.status, 200);
  const afterBody = await after.json();
  assert.equal(afterBody.organizer._count.events, canonicalLiveEvents.length - 1);

  await prisma.event.update({ where: { id: canonicalLiveEvents[0].id }, data: { status: "PUBLISHED" } });
});
test("search organizer by description (organizer search matches public description, not just name)", async () => {
  const { body } = await discover(`type=organizers&q=${encodeURIComponent(uniqueTag)}`);
  assert.ok(body.items.some((o: { id: string; description: string | null }) => o.id === orgC.organizerId && o.description?.includes(uniqueTag)));
});

test("empty search returns the unfiltered public dataset", async () => {
  const { status, body } = await discover("type=events");
  assert.equal(status, 200);
  assert.ok(body.total >= 2);