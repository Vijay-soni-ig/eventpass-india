import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

const ts = Date.now();
let baseUrl: string;
let stop: () => Promise<void>;
let organizer: Awaited<ReturnType<typeof bootstrapOrganizer>> | null = null;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  organizer = await bootstrapOrganizer(baseUrl, "legacy-ticket-map", ts);
});

after(async () => {
  if (organizer) await cleanupOrganizers([organizer.organizerId]);
  await stop();
  await prisma.$disconnect();
});

const auth = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

test("linked Exhibition ticket create/update mirrors one EventTicketType and deletion protects reservations", async () => {
  const currentOrganizer = organizer;
  if (!currentOrganizer) throw new Error("Organizer fixture was not initialized");
  const exhibitionId = currentOrganizer.firstExhibitionId;
  const exhibition = await prisma.exhibition.findUniqueOrThrow({
    where: { id: exhibitionId },
    select: { eventId: true },
  });
  assert.ok(exhibition.eventId, "new Exhibitions must already have their paired Event");

  const legacyTicket = await prisma.ticketType.findFirstOrThrow({ where: { exhibitionId } });
  const initialMirror = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId: legacyTicket.id },
  });
  assert.equal(initialMirror.eventId, exhibition.eventId);
  assert.equal(initialMirror.name, legacyTicket.name);
  assert.equal(Number(initialMirror.price), Number(legacyTicket.price));
  assert.equal(initialMirror.capacity, legacyTicket.quantity);
  assert.equal(initialMirror.status, "ACTIVE");
  assert.equal(initialMirror.sortOrder, 0);

  const createResponse = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets`, {
    method: "POST",
    headers: auth(currentOrganizer.token),
    body: JSON.stringify({ name: "VIP Mapping", price: 999, quantity: 10, visible: true }),
  });
  const createBody = await createResponse.json();
  assert.equal(createResponse.status, 201, JSON.stringify(createBody));
  const createdMirror = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId: createBody.ticket.id },
  });
  assert.equal(createdMirror.eventId, exhibition.eventId);
  assert.equal(createdMirror.name, "VIP Mapping");
  assert.equal(Number(createdMirror.price), 999);
  assert.equal(createdMirror.capacity, 10);

  const updateResponse = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets/${legacyTicket.id}`, {
    method: "PUT",
    headers: auth(currentOrganizer.token),
    body: JSON.stringify({ price: 149, quantity: 75, visible: false }),
  });
  const updateBody = await updateResponse.json();
  assert.equal(updateResponse.status, 200, JSON.stringify(updateBody));

  const updatedMirror = await prisma.eventTicketType.findUniqueOrThrow({
    where: { legacyTicketTypeId: legacyTicket.id },
  });
  assert.equal(Number(updatedMirror.price), 149);
  assert.equal(updatedMirror.capacity, 75);
  assert.equal(updatedMirror.status, "INACTIVE");

  const reservation = await prisma.eventTicketReservation.create({
    data: {
      eventTicketTypeId: updatedMirror.id,
      eventId: exhibition.eventId,
      userId: currentOrganizer.userId,
      attendeeName: "Mapping regression",
      attendeeEmail: currentOrganizer.email,
      quantity: 1,
      unitPrice: 149,
      currency: "INR",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  const blockedDelete = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets/${legacyTicket.id}`, {
    method: "DELETE",
    headers: auth(currentOrganizer.token),
  });
  assert.equal(blockedDelete.status, 409, "a mapped ticket type with Event reservations must not be deleted");
  assert.ok(await prisma.eventTicketType.findUnique({ where: { id: updatedMirror.id } }), "the mapped Event ticket type must remain");

  await prisma.eventTicketReservation.delete({ where: { id: reservation.id } });
  const deleteResponse = await fetch(`${baseUrl}/api/exhibitions/${exhibitionId}/tickets/${legacyTicket.id}`, {
    method: "DELETE",
    headers: auth(currentOrganizer.token),
  });
  assert.equal(deleteResponse.status, 204);
  assert.equal(
    await prisma.eventTicketType.findUnique({ where: { legacyTicketTypeId: legacyTicket.id } }),
    null,
    "deleting an unused legacy ticket type also removes its mirror",
  );
});
