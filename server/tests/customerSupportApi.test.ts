import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const supportTicketIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    await prisma.supportTicket.deleteMany({ where: { id: { in: supportTicketIds } } });
    await cleanupOrganizers(organizerIds);
  } finally {
    await stop();
    await prisma.$disconnect();
  }
});

async function request(path: string, token?: string, init: RequestInit = {}) {
  return fetch(baseUrl + path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

test("customer support API enforces tenant scope, derives requester identity, and hides internal notes", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "support-api-owner", ts + 1);
  const other = await bootstrapOrganizer(baseUrl, "support-api-other", ts + 2);
  organizerIds.push(owner.organizerId, other.organizerId);

  const unauthenticated = await request("/api/support/customer");
  assert.equal(unauthenticated.status, 401);

  const spoofed = await request("/api/support/customer", owner.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: { type: "organizer", organizerId: owner.organizerId },
      subject: "Requester identity spoof test",
      description: "This payload attempts to set a different requester identity.",
      requesterUserId: other.userId,
    }),
  });
  assert.equal(spoofed.status, 400, "unknown identity fields must be rejected by strict validation");

  const create = await request("/api/support/customer", owner.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: { type: "organizer", organizerId: owner.organizerId },
      subject: "Need help with event setup",
      description: "Please help us configure our event workspace.",
      category: "technical",
    }),
  });
  const created = await create.json();
  assert.equal(create.status, 201, JSON.stringify(created));
  supportTicketIds.push(created.ticket.id);
  assert.equal(created.ticket.requesterName, "Phase20C support-api-owner");
  assert.equal(created.ticket.organizer.id, owner.organizerId);
  assert.equal(created.ticket.messages.length, 1);

  assert.equal(created.ticket.status, "open", "new customer tickets must start open");

  const crossTenantDetail = await request(`/api/support/customer/${created.ticket.id}`, other.token);
  assert.equal(crossTenantDetail.status, 404, "a different tenant must not learn that the ticket exists");

  const crossTenantReply = await request(`/api/support/customer/${created.ticket.id}/messages`, other.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "Cross-tenant attempt" }),
  });
  assert.equal(crossTenantReply.status, 404);

  const reply = await request(`/api/support/customer/${created.ticket.id}/messages`, owner.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "Here is the additional information you requested." }),
  });
  const replyBody = await reply.json();
  assert.equal(reply.status, 201, JSON.stringify(replyBody));
  assert.equal(replyBody.message.body, "Here is the additional information you requested.");
  assert.equal(replyBody.message.isInternalNote, undefined, "customer response must not expose internal-note controls");

  await prisma.supportTicketMessage.create({
    data: {
      ticketId: created.ticket.id,
      authorUserId: other.userId,
      body: "Internal-only investigation note",
      isInternalNote: true,
    },
  });

  const detail = await request(`/api/support/customer/${created.ticket.id}`, owner.token);
  const detailBody = await detail.json();
  assert.equal(detail.status, 200, JSON.stringify(detailBody));
  assert.equal(detailBody.ticket.messages.some((message: { body: string }) => message.body.includes("Internal-only")), false);
  assert.equal(JSON.stringify(detailBody).includes("assignedToUser"), false);

  const persisted = await prisma.supportTicket.findUniqueOrThrow({
    where: { id: created.ticket.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  assert.equal(persisted.requesterUserId, owner.userId, "requester identity must come from the authenticated session");
  assert.equal(persisted.messages.filter((message) => message.isInternalNote).length, 1);
  assert.equal(persisted.messages.filter((message) => !message.isInternalNote).length, 2);
});

test("customer support list uses bounded cursor pagination and rejects foreign cursors", async () => {
  const owner = await bootstrapOrganizer(baseUrl, "support-page-owner", ts + 3);
  const other = await bootstrapOrganizer(baseUrl, "support-page-other", ts + 4);
  organizerIds.push(owner.organizerId, other.organizerId);

  for (const index of [1, 2]) {
    const response = await request("/api/support/customer", owner.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: { type: "organizer", organizerId: owner.organizerId },
        subject: `Pagination support request ${index}`,
        description: `This is a pagination test request number ${index}.`,
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    supportTicketIds.push(body.ticket.id);
  }

  const first = await request("/api/support/customer?limit=1", owner.token);
  const firstBody = await first.json();
  assert.equal(first.status, 200, JSON.stringify(firstBody));
  assert.equal(firstBody.tickets.length, 1);
  assert.equal(firstBody.pageInfo.hasMore, true);
  assert.ok(firstBody.pageInfo.nextCursor);

  const second = await request(`/api/support/customer?limit=1&cursor=${firstBody.pageInfo.nextCursor}`, owner.token);
  const secondBody = await second.json();
  assert.equal(second.status, 200, JSON.stringify(secondBody));
  assert.equal(secondBody.tickets.length, 1);
  assert.notEqual(secondBody.tickets[0].id, firstBody.tickets[0].id);
  assert.equal(secondBody.pageInfo.hasMore, false);

  const foreignCursor = await request(`/api/support/customer?cursor=${firstBody.pageInfo.nextCursor}`, other.token);
  assert.equal(foreignCursor.status, 404);
  const excessiveLimit = await request("/api/support/customer?limit=51", owner.token);
  assert.equal(excessiveLimit.status, 400);
});
