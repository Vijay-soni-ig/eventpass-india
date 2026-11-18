import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
let adminToken: string;
let regularUserId: string;
const ts = Date.now();
const ticketIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "platform.admin@eventpass.test", password: "DevPassword123!" }),
  }).then((response) => response.json());
  assert.ok(login.token, `platform admin login must succeed: ${JSON.stringify(login)}`);
  adminToken = login.token as string;

  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `support-ops-regular-${ts}@example.com`,
      password: "testpass123",
      fullName: "Support Ops Regular User",
      userType: "visitor",
    }),
  }).then((response) => response.json());
  assert.ok(signup.user?.id, `regular user signup must succeed: ${JSON.stringify(signup)}`);
  regularUserId = signup.user.id as string;
});

after(async () => {
  try {
    if (ticketIds.length) {
      await prisma.notificationIntent.deleteMany({ where: { entity_type: "SupportTicket", entity_id: { in: ticketIds } } });
      await prisma.auditLog.deleteMany({ where: { entityType: "SupportTicket", entityId: { in: ticketIds } } });
      await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
    }
    if (regularUserId) await prisma.user.deleteMany({ where: { id: regularUserId } });
  } finally {
    await stop();
    await prisma.$disconnect();
  }
});

async function adminRequest(path: string, init: RequestInit = {}) {
  return fetch(baseUrl + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(init.headers ?? {}),
    },
  });
}

test("platform support queue paginates filtered results and reports global summary", async () => {
  const marker = `EXH05B04A-${ts}`;
  for (let index = 1; index <= 3; index += 1) {
    const ticket = await prisma.supportTicket.create({
      data: {
        subject: `${marker} ticket ${index}`,
        category: "technical",
        priority: index === 1 ? "urgent" : "medium",
        status: index === 1 ? "open" : "in_progress",
        requesterEmail: `requester-${index}@example.com`,
      },
    });
    ticketIds.push(ticket.id);
  }

  const firstResponse = await adminRequest(`/api/platform/support?search=${marker}&page=1&limit=2`);
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 200, JSON.stringify(first));
  assert.equal(first.tickets.length, 2);
  assert.equal(first.pageInfo.page, 1);
  assert.equal(first.pageInfo.limit, 2);
  assert.equal(first.pageInfo.total, 3);
  assert.equal(first.pageInfo.totalPages, 2);

  const secondResponse = await adminRequest(`/api/platform/support?search=${marker}&page=2&limit=2`);
  const second = await secondResponse.json();
  assert.equal(secondResponse.status, 200, JSON.stringify(second));
  assert.equal(second.tickets.length, 1);
  assert.equal(second.pageInfo.total, 3);
  assert.notEqual(first.tickets[0].id, second.tickets[0].id);
  assert.equal(typeof first.summary.open, "number");
  assert.equal(typeof first.summary.highPriority, "number");

  const invalidPage = await adminRequest(`/api/platform/support?search=${marker}&page=0`);
  assert.equal(invalidPage.status, 400);
  const excessiveLimit = await adminRequest(`/api/platform/support?search=${marker}&limit=101`);
  assert.equal(excessiveLimit.status, 400);
});

test("platform support rejects non-admin assignees and audits staff actions", async () => {
  const ticket = await prisma.supportTicket.create({
    data: {
      subject: `EXH05B04A audit ticket ${ts}`,
      category: "technical",
      priority: "medium",
      status: "open",
      requesterUserId: regularUserId,
    },
  });
  ticketIds.push(ticket.id);

  const invalidAssignee = await adminRequest(`/api/platform/support/${ticket.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignedToUserId: regularUserId }),
  });
  assert.equal(invalidAssignee.status, 400);

  const statusUpdate = await adminRequest(`/api/platform/support/${ticket.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_progress", priority: "high" }),
  });
  assert.equal(statusUpdate.status, 200, await statusUpdate.text());

  const publicReply = await adminRequest(`/api/platform/support/${ticket.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "Public support response", isInternalNote: false }),
  });
  assert.equal(publicReply.status, 201, await publicReply.text());

  const internalNote = await adminRequest(`/api/platform/support/${ticket.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "Internal investigation note", isInternalNote: true }),
  });
  assert.equal(internalNote.status, 201, await internalNote.text());

  const intents = await prisma.notificationIntent.findMany({
    where: { entity_type: "SupportTicket", entity_id: ticket.id },
    select: { event_type: true, payload: true, idempotency_key: true },
  });
  const eventTypes = intents.map((intent) => intent.event_type);
  assert.ok(eventTypes.includes("SUPPORT_STATUS_CHANGED"));
  assert.ok(eventTypes.includes("SUPPORT_STAFF_REPLIED"));
  assert.ok(eventTypes.includes("SUPPORT_INTERNAL_NOTE_ADDED"));
  assert.equal(new Set(intents.map((intent) => intent.idempotency_key)).size, intents.length);
  assert.equal(JSON.stringify(intents).includes("Internal investigation note"), false, "internal note content must never enter notification payloads");

  const actions = await prisma.auditLog.findMany({
    where: { entityType: "SupportTicket", entityId: ticket.id },
    select: { action: true },
  });
  const actionNames = actions.map((entry) => entry.action);
  assert.ok(actionNames.includes("support.ticket_status_changed"));
  assert.ok(actionNames.includes("support.ticket_priority_changed"));
  assert.ok(actionNames.includes("support.ticket_internal_note_added"));
});
