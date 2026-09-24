import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, setSubscription } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const eventIds: string[] = [];
const ticketIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  if (ticketIds.length) await prisma.eventTicketType.deleteMany({ where: { id: { in: ticketIds } } });
  if (eventIds.length) {
    await prisma.eventModuleEnablement.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  }
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("event ticket inventory is tenant-scoped for list, update, and archive", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "a1-ticket-owner", ts);
  const other = await bootstrapOrganizer(baseUrl, "a1-ticket-other", ts);
  organizerIds.push(owner.organizerId, other.organizerId);
  await setSubscription(owner.organizerId, "enterprise", "active");
  await setSubscription(other.organizerId, "enterprise", "active");

  const event = await prisma.event.create({
    data: {
      organizerId: owner.organizerId,
      ownerId: owner.userId,
      title: "A1 Ticket Inventory Boundary",
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-03-01T10:00:00Z"),
      endDate: new Date("2030-03-01T18:00:00Z"),
      moduleEnablements: { create: { moduleType: "TICKETING", enabled: true } },
    },
  });
  eventIds.push(event.id);

  const ticket = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "A1 Inventory Ticket",
      price: 500,
      currency: "INR",
      capacity: 100,
      maxPerOrder: 4,
      status: "ACTIVE",
    },
  });
  ticketIds.push(ticket.id);

  const list = await fetch(baseUrl + "/api/event-tickets?eventId=" + event.id, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(list.status, 404);

  const update = await fetch(baseUrl + "/api/event-tickets/" + ticket.id, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Hijacked Ticket", price: 1 }),
  });
  assert.equal(update.status, 404);

  const archive = await fetch(baseUrl + "/api/event-tickets/" + ticket.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(archive.status, 404);

  const unchanged = await prisma.eventTicketType.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(unchanged.name, "A1 Inventory Ticket");
  assert.equal(Number(unchanged.price), 500);
  assert.equal(unchanged.status, "ACTIVE");
});
