import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, createExhibition, cleanupOrganizers } from "./helpers/entitlementFixtures";

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

test("exhibition, ticket type, and stall APIs enforce organizer tenant isolation", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "exhibition-isolation-owner", ts);
  const other = await bootstrapOrganizer(baseUrl, "exhibition-isolation-other", ts);
  organizerIds.push(owner.organizerId, other.organizerId);

  const created = await createExhibition(baseUrl, owner.token, "Tenant Isolation Exhibition", {
    status: "live",
    visibility: "public",
    ticketTypes: [{ name: "Tenant Ticket", price: 100, quantity: 10, taxPercent: 0, visible: true }],
    stalls: [{ code: "A-01", price: 5000, stallType: "standard" }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const exhibitionId = created.body.exhibition.id as string;
  const ticketId = created.body.exhibition.ticketTypes[0].id as string;
  const stallId = created.body.exhibition.stalls[0].id as string;

  const crossDetail = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossDetail.status, 404);

  const crossList = await fetch(baseUrl + "/api/exhibitions?organizerId=" + owner.organizerId, {
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossList.status, 200);
  const crossListBody = await crossList.json();
  assert.equal(crossListBody.exhibitions.some((e: { id: string }) => e.id === exhibitionId), false);

  const crossUpdate = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Hijacked Exhibition" }),
  });
  assert.equal(crossUpdate.status, 404);

  const crossDelete = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossDelete.status, 404);

  const crossDuplicate = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/duplicate", {
    method: "POST",
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossDuplicate.status, 404);

  const crossTicketCreate = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/tickets", {
    method: "POST",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Injected Ticket", price: 1, quantity: 1, taxPercent: 0, visible: true }),
  });
  assert.equal(crossTicketCreate.status, 404);

  const crossTicketUpdate = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/tickets/" + ticketId, {
    method: "PUT",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ price: 1 }),
  });
  assert.equal(crossTicketUpdate.status, 404);

  const crossTicketDelete = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/tickets/" + ticketId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossTicketDelete.status, 404);

  const crossStallCreate = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/stalls", {
    method: "POST",
    headers: { Authorization: "Bearer " + other.token, "Content-Type": "application/json" },
    body: JSON.stringify({ code: "B-01", price: 4000, stallType: "basic" }),
  });
  assert.equal(crossStallCreate.status, 404);

  const crossStallDelete = await fetch(baseUrl + "/api/exhibitions/" + exhibitionId + "/stalls/" + stallId, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + other.token },
  });
  assert.equal(crossStallDelete.status, 404);

  const stillThere = await prisma.exhibition.findUniqueOrThrow({
    where: { id: exhibitionId },
    include: { ticketTypes: true, stalls: true },
  });
  assert.equal(stillThere.name, "Tenant Isolation Exhibition");
  assert.equal(stillThere.ticketTypes.length, 1);
  assert.equal(stillThere.ticketTypes[0].price.toString(), "100");
  assert.equal(stillThere.stalls.length, 1);
});
