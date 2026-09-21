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
      fullName: userType === "organizer" ? "Registration QA Organizer" : "Registration QA Visitor",
      userType,
    }),
  });

  assert.equal(response.status, 201);
  return await response.json() as { token: string; user: { id: string } };
}

test("registration foundation lifecycle enforces idempotency, capacity, cancellation and re-registration", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const suffix = Date.now();

  try {
    const organizer = await signup(
      baseUrl,
      `registration-foundation-org-${suffix}@example.com`,
      "organizer",
    );
    const membership = await prisma.organizerMembership.findFirstOrThrow({
      where: { userId: organizer.user.id, status: "active" },
    });

    const event = await prisma.event.create({
      data: {
        organizerId: membership.organizerId,
        ownerId: organizer.user.id,
        title: `Registration Foundation ${suffix}`,
        eventType: "CONFERENCE",
        status: "PUBLISHED",
        visibility: "public",
        startDate: new Date("2027-06-01"),
        endDate: new Date("2027-06-02"),
      },
    });

    await prisma.eventRegistrationSettings.create({
      data: { eventId: event.id, enabled: true, capacity: 1, requiresApproval: false },
    });

    const visitorEmail = `registration-foundation-visitor-${suffix}@example.com`;
    const first = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-${suffix}-first`,
      },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Registration QA Visitor",
        email: visitorEmail,
        consentAccepted: true,
      }),
    });

    assert.equal(first.status, 201);
    const firstBody = await first.json() as {
      registration: { id: string; status: string };
      reactivated: boolean;
    };
    assert.equal(firstBody.registration.status, "CONFIRMED");
    assert.equal(firstBody.reactivated, false);

    const replay = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-${suffix}-first`,
      },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Registration QA Visitor",
        email: visitorEmail,
        consentAccepted: true,
      }),
    });

    assert.equal(replay.status, 200);
    const replayBody = await replay.json() as { registration: { id: string } };
    assert.equal(replayBody.registration.id, firstBody.registration.id);

    const duplicate = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-${suffix}-duplicate`,
      },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Registration QA Visitor",
        email: visitorEmail,
        consentAccepted: true,
      }),
    });
    assert.equal(duplicate.status, 409);

    const secondEmail = `registration-foundation-second-${suffix}@example.com`;
    const capacityBlocked = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-${suffix}-capacity`,
      },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Capacity Blocked Visitor",
        email: secondEmail,
        consentAccepted: true,
      }),
    });
    assert.equal(capacityBlocked.status, 409);

    const cancel = await fetch(
      `${baseUrl}/api/organizer/registrations/${firstBody.registration.id}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${organizer.token}`,
        },
        body: JSON.stringify({
          status: "CANCELLED",
          cancellationReason: "Registration lifecycle regression test",
        }),
      },
    );
    assert.equal(cancel.status, 200);

    const reRegister = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-${suffix}-reactivation`,
      },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Registration QA Visitor Reactivated",
        email: visitorEmail,
        consentAccepted: true,
      }),
    });

    assert.equal(reRegister.status, 201);
    const reRegisterBody = await reRegister.json() as {
      registration: { id: string; status: string; cancellationReason: string | null };
      reactivated: boolean;
    };
    assert.equal(reRegisterBody.reactivated, true);
    assert.equal(reRegisterBody.registration.id, firstBody.registration.id);
    assert.equal(reRegisterBody.registration.status, "CONFIRMED");
    assert.equal(reRegisterBody.registration.cancellationReason, null);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("registration analytics is tenant-scoped and does not expose another organizer's event", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const suffix = Date.now();

  try {
    const organizerA = await signup(
      baseUrl,
      `registration-isolation-a-${suffix}@example.com`,
      "organizer",
    );
    const organizerB = await signup(
      baseUrl,
      `registration-isolation-b-${suffix}@example.com`,
      "organizer",
    );

    const membershipA = await prisma.organizerMembership.findFirstOrThrow({
      where: { userId: organizerA.user.id, status: "active" },
    });

    const event = await prisma.event.create({
      data: {
        organizerId: membershipA.organizerId,
        ownerId: organizerA.user.id,
        title: `Registration Isolation ${suffix}`,
        eventType: "CONFERENCE",
        status: "PUBLISHED",
        visibility: "public",
        startDate: new Date("2027-07-01"),
        endDate: new Date("2027-07-02"),
      },
    });

    await prisma.eventRegistrationSettings.create({
      data: { eventId: event.id, enabled: true, capacity: null, requiresApproval: false },
    });

    const response = await fetch(
      `${baseUrl}/api/organizer/registrations/analytics/${event.id}`,
      { headers: { Authorization: `Bearer ${organizerB.token}` } },
    );

    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
