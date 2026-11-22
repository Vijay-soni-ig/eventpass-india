import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

const ts = Date.now();
let baseUrl: string;
let stop: () => Promise<void>;
let organizerId: string | undefined;
let eventId: string | undefined;
const memberUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (eventId) await prisma.event.deleteMany({ where: { id: eventId } });
    if (organizerId) await cleanupOrganizers([organizerId]);
    if (memberUserIds.length) await prisma.user.deleteMany({ where: { id: { in: memberUserIds } } });
  } finally {
    await stop();
  }
});

async function signup(label: string) {
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Test-Rate-Limit-Key": `pr943-finance-permission-${label}-${ts}`,
    },
    body: JSON.stringify({
      email: `pr943-${label}-${ts}@example.com`,
      password: "TestPassword123!",
      fullName: `PR943 ${label}`,
      userType: "exhibitor",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  memberUserIds.push(body.user.id);
  return body.token as string;
}

test("Universal Event analytics exposes financial fields only to payment:view members", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "pr943-finance-visibility", ts);
  organizerId = owner.organizerId;

  const financeToken = await signup("finance");
  const marketingToken = await signup("marketing");
  const financeUserId = memberUserIds[0];
  const marketingUserId = memberUserIds[1];

  await prisma.organizerMembership.createMany({
    data: [
      { organizerId: owner.organizerId, userId: financeUserId, role: "finance", status: "active" },
      { organizerId: owner.organizerId, userId: marketingUserId, role: "marketing", status: "active" },
    ],
  });

  const event = await prisma.event.create({
    data: {
      organizerId: owner.organizerId,
      ownerId: owner.userId,
      title: `PR943 financial visibility ${ts}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      moduleEnablements: { create: [{ moduleType: "ANALYTICS", enabled: true }] },
    },
  });
  eventId = event.id;

  const financeResponse = await fetch(`${baseUrl}/api/organizer/event-analytics/${event.id}`, {
    headers: { Authorization: `Bearer ${financeToken}` },
  });
  assert.equal(financeResponse.status, 200, await financeResponse.clone().text());
  const financeAnalytics = await financeResponse.json();
  assert.equal(typeof financeAnalytics.orders.grossPaid, "number");
  assert.equal(typeof financeAnalytics.orders.refundedAmount, "number");
  assert.equal(typeof financeAnalytics.orders.netTicketRevenue, "number");
  assert.ok(financeAnalytics.ticketTypes.every((type: { price: unknown }) => typeof type.price === "number"));

  const marketingResponse = await fetch(`${baseUrl}/api/organizer/event-analytics/${event.id}`, {
    headers: { Authorization: `Bearer ${marketingToken}` },
  });
  assert.equal(marketingResponse.status, 200, await marketingResponse.clone().text());
  const marketingAnalytics = await marketingResponse.json();
  assert.equal(marketingAnalytics.orders.grossPaid, null);
  assert.equal(marketingAnalytics.orders.refundedAmount, null);
  assert.equal(marketingAnalytics.orders.netTicketRevenue, null);
  assert.ok(marketingAnalytics.ticketTypes.every((type: { price: unknown }) => type.price === null));
});
