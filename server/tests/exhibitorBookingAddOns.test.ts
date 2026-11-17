import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, cleanupOrphanPayments } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];
const ts = Date.now();

before(async () => { ({ baseUrl, stop } = await startTestServer()); });
after(async () => {
  await cleanupOrphanPayments();
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function request(path: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test("exhibitor add-ons are server-priced, snapshotted and unchanged by later organizer edits", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "exh03bc-snapshot", ts);
  organizerIds.push(organizer.organizerId);
  const addOn = await request(`/api/exhibitions/${organizer.firstExhibitionId}/add-ons`, organizer.token, "POST", {
    name: "Power connection", description: "Dedicated electrical point", price: 1250.5, maxQuantityPerBooking: 3,
  });
  assert.equal(addOn.status, 201, JSON.stringify(addOn.body));

  const exhibitor = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "exh03bc-snapshot", ts);
  assert.equal((await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, exhibitor.participationId)).status, 200);
  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 10000);
  assert.equal(stall.status, 201);
  assert.equal((await selectStall(baseUrl, exhibitor.token, exhibitor.participationId, stall.body.stall.id)).status, 200);

  const list = await request(`/api/exhibitor/participations/${exhibitor.participationId}/add-ons`, exhibitor.token);
  assert.equal(list.status, 200);
  assert.equal(list.body.addOns.length, 1);

  const tooMany = await request(`/api/exhibitor/participations/${exhibitor.participationId}/payment`, exhibitor.token, "POST", {
    addOns: [{ addOnId: addOn.body.addOn.id, quantity: 4 }],
  });
  assert.equal(tooMany.status, 409);
  const duplicate = await request(`/api/exhibitor/participations/${exhibitor.participationId}/payment`, exhibitor.token, "POST", {
    addOns: [{ addOnId: addOn.body.addOn.id, quantity: 1 }, { addOnId: addOn.body.addOn.id, quantity: 1 }],
  });
  assert.equal(duplicate.status, 400);

  const checkout = await request(`/api/exhibitor/participations/${exhibitor.participationId}/payment`, exhibitor.token, "POST", {
    addOns: [{ addOnId: addOn.body.addOn.id, quantity: 2 }],
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  assert.equal(Number(checkout.body.payment.baseAmount), 12501);
  assert.equal(checkout.body.booking.addOnItems.length, 1);
  assert.equal(Number(checkout.body.booking.addOnItems[0].unitPrice), 1250.5);
  assert.equal(Number(checkout.body.booking.addOnItems[0].lineTotal), 2501);

  const changed = await request(`/api/exhibitions/${organizer.firstExhibitionId}/add-ons/${addOn.body.addOn.id}`, organizer.token, "PATCH", { price: 1800 });
  assert.equal(changed.status, 200);
  const history = await request(`/api/exhibitor/participations/${exhibitor.participationId}/payments`, exhibitor.token);
  assert.equal(history.status, 200, JSON.stringify(history.body));
  assert.equal(Number(history.body.bookings[0].addOnItems[0].unitPrice), 1250.5);
  assert.equal(Number(history.body.bookings[0].addOnItems[0].lineTotal), 2501);

  const retry = await request(`/api/exhibitor/participations/${exhibitor.participationId}/payment`, exhibitor.token, "POST", { addOns: [] });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.payment.id, checkout.body.payment.id);
  assert.equal(Number(retry.body.booking.addOnItems[0].unitPrice), 1250.5);
});

test("add-on listing is participation-scoped and respects availability windows", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "exh03bc-access", ts + 1);
  organizerIds.push(organizer.organizerId);
  const addOn = await request(`/api/exhibitions/${organizer.firstExhibitionId}/add-ons`, organizer.token, "POST", {
    name: "Future service", price: 500, availableFrom: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(addOn.status, 201);
  const owner = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "exh03bc-owner", ts + 1);
  const other = await applyAsExhibitor(baseUrl, organizer.firstExhibitionId, "exh03bc-other", ts + 2);
  const approval = await approveParticipation(baseUrl, organizer.token, organizer.firstExhibitionId, owner.participationId);
  assert.equal(approval.status, 200);
  const stall = await createStall(baseUrl, organizer.token, organizer.firstExhibitionId, 5000);
  assert.equal(stall.status, 201);
  const reservation = await selectStall(baseUrl, owner.token, owner.participationId, stall.body.stall.id);
  assert.equal(reservation.status, 200);
  const ownerList = await request(`/api/exhibitor/participations/${owner.participationId}/add-ons`, owner.token);
  assert.equal(ownerList.status, 200);
  assert.equal(ownerList.body.addOns.length, 0);
  const foreignList = await request(`/api/exhibitor/participations/${owner.participationId}/add-ons`, other.token);
  assert.equal(foreignList.status, 404);
});
