import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { app } from "../src/app";

after(async () => {
  await prisma.$disconnect();
});

async function signup(baseUrl: string, email: string, userType: "organizer" | "visitor") {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": email },
    body: JSON.stringify({
      email,
      password: "ValidPassword!123",
      fullName: userType === "organizer" ? "Registration Organizer" : "Registration Visitor",
      userType,
    }),
  });
  const body = await response.json() as { token: string; user: { id: string } };
  assert.equal(response.status, 201);
  return body;
}

async function createPublishedEvent(ownerUserId: string, organizerId: string) {
  return prisma.event.create({
    data: {
      organizerId,
      ownerId: ownerUserId,
      title: `Registration Test Event ${Date.now()}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2027-01-01"),
      endDate: new Date("2027-01-02"),
      venue: "Test Venue",
      city: "Ahmedabad",
    },
  });
}

test("public registration confirms immediately, rejects duplicate email, and is idempotent", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const organizerEmail = `registration-org-${Date.now()}@example.com`;

  try {
    const organizer = await signup(baseUrl, organizerEmail, "organizer");
    const organizerRecord = await prisma.user.findUniqueOrThrow({ where: { id: organizer.user.id } });
    const membership = await prisma.organizerMembership.findFirstOrThrow({ where: { userId: organizer.user.id, status: "active" } });
    const event = await createPublishedEvent(organizerRecord.id, membership.organizerId);

    const first = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "registration-test-key-1" },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "First Visitor",
        email: "first-visitor@example.com",
        consentAccepted: true,
      }),
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json() as { registration: { id: string; status: string } };
    assert.equal(firstBody.registration.status, "CONFIRMED");

    const replay = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "registration-test-key-1" },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Different Name",
        email: "different@example.com",
        consentAccepted: true,
      }),
    });
    assert.equal(replay.status, 200);
    const replayBody = await replay.json() as { registration: { id: string }; idempotentReplay: boolean };
    assert.equal(replayBody.registration.id, firstBody.registration.id);
    assert.equal(replayBody.idempotentReplay, true);

    const duplicate = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "First Visitor Again",
        email: "first-visitor@example.com",
        consentAccepted: true,
      }),
    });
    assert.equal(duplicate.status, 409);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("registration capacity is enforced under the per-event lock", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const organizerEmail = `registration-capacity-${Date.now()}@example.com`;

  try {
    const organizer = await signup(baseUrl, organizerEmail, "organizer");
    const membership = await prisma.organizerMembership.findFirstOrThrow({ where: { userId: organizer.user.id, status: "active" } });
    const event = await createPublishedEvent(organizer.user.id, membership.organizerId);

    await prisma.eventRegistrationSettings.create({
      data: { eventId: event.id, capacity: 1, enabled: true, requiresApproval: false },
    });

    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/api/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, fullName: "Capacity One", email: `capacity-one-${Date.now()}@example.com`, consentAccepted: true }),
      }),
      fetch(`${baseUrl}/api/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, fullName: "Capacity Two", email: `capacity-two-${Date.now()}@example.com`, consentAccepted: true }),
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("organizer can configure registration and review registrations within their event scope", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const organizerEmail = `registration-manage-${Date.now()}@example.com`;

  try {
    const organizer = await signup(baseUrl, organizerEmail, "organizer");
    const membership = await prisma.organizerMembership.findFirstOrThrow({ where: { userId: organizer.user.id, status: "active" } });
    const event = await createPublishedEvent(organizer.user.id, membership.organizerId);

    const settings = await fetch(`${baseUrl}/api/organizer/registrations/settings/${event.id}`, {
      headers: { Authorization: `Bearer ${organizer.token}` },
    });
    assert.equal(settings.status, 200);

    const update = await fetch(`${baseUrl}/api/organizer/registrations/settings/${event.id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${organizer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, capacity: 5, requiresApproval: true }),
    });
    assert.equal(update.status, 200);

    const visitorEmail = `registration-visitor-${Date.now()}@example.com`;
    const visitor = await signup(baseUrl, visitorEmail, "visitor");
    const created = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${visitor.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, fullName: "Approval Visitor", email: visitorEmail, consentAccepted: true }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { registration: { id: string; status: string } };
    assert.equal(createdBody.registration.status, "PENDING");

    const list = await fetch(`${baseUrl}/api/organizer/registrations?eventId=${event.id}&status=PENDING`, {
      headers: { Authorization: `Bearer ${organizer.token}` },
    });
    assert.equal(list.status, 200);
    const listBody = await list.json() as { total: number; registrations: Array<{ id: string }> };
    assert.equal(listBody.total, 1);
    assert.equal(listBody.registrations[0].id, createdBody.registration.id);

    const confirm = await fetch(`${baseUrl}/api/organizer/registrations/${createdBody.registration.id}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${organizer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CONFIRMED" }),
    });
    assert.equal(confirm.status, 200);
    const confirmBody = await confirm.json() as { registration: { status: string; confirmedAt: string | null } };
    assert.equal(confirmBody.registration.status, "CONFIRMED");
    assert.ok(confirmBody.registration.confirmedAt);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
