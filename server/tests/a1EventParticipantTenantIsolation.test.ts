import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("event participant tenant isolation rejects cross-organizer reads and mutations", async () => {
  const orgA = await bootstrapOrganizer(baseUrl, "a1-participant-a", ts + 1);
  const orgB = await bootstrapOrganizer(baseUrl, "a1-participant-b", ts + 2);
  organizerIds.push(orgA.organizerId, orgB.organizerId);

  const orgBExhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: orgB.firstExhibitionId },
    select: { eventId: true },
  });
  assert.ok(orgBExhibition.eventId);

  const participantTypes = [
    { type: "PARTNER" as const, moduleType: "PARTNERS" as const, path: "partners", name: "Tenant B Partner" },
    { type: "SPEAKER" as const, moduleType: "SPEAKERS" as const, path: "speakers", name: "Tenant B Speaker" },
    { type: "SPONSOR" as const, moduleType: "SPONSORS" as const, path: "sponsors", name: "Tenant B Sponsor" },
    { type: "VENDOR" as const, moduleType: "VENDORS" as const, path: "vendors", name: "Tenant B Vendor" },
    { type: "STAFF" as const, moduleType: "PARTICIPANTS" as const, path: "staff", name: "Tenant B Staff" },
  ];

  for (const participant of participantTypes) {
    await prisma.eventModuleEnablement.upsert({
      where: { eventId_moduleType: { eventId: orgBExhibition.eventId, moduleType: participant.moduleType } },
      update: { enabled: true },
      create: { eventId: orgBExhibition.eventId, moduleType: participant.moduleType, enabled: true },
    });

    const row = await prisma.eventParticipant.create({
      data: {
        eventId: orgBExhibition.eventId,
        participantType: participant.type,
        name: participant.name,
        isPublic: participant.type !== "STAFF",
      },
    });

    const read = await fetch(
      `${baseUrl}/api/events/${orgBExhibition.eventId}/${participant.path}`,
      { headers: { Authorization: `Bearer ${orgA.token}` } },
    );
    assert.equal(read.status, 404, JSON.stringify(await read.json()));

    const patch = await fetch(
      `${baseUrl}/api/events/${orgBExhibition.eventId}/${participant.path}/${row.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${orgA.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Cross-tenant mutation" }),
      },
    );
    assert.equal(patch.status, 404, JSON.stringify(await patch.json()));

    const remove = await fetch(
      `${baseUrl}/api/events/${orgBExhibition.eventId}/${participant.path}/${row.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${orgA.token}` },
      },
    );
    assert.equal(remove.status, 404, JSON.stringify(await remove.json()));

    const untouched = await prisma.eventParticipant.findUnique({
      where: { id: row.id },
      select: { name: true, archivedAt: true, eventId: true },
    });
    assert.equal(untouched?.name, participant.name);
    assert.equal(untouched?.archivedAt, null);
    assert.equal(untouched?.eventId, orgBExhibition.eventId);
  }
});
