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


test("confirmed event registration can bridge into one ticket purchase", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const organizerEmail = `registration-ticket-org-${Date.now()}@example.com`;
  const visitorEmail = `registration-ticket-visitor-${Date.now()}@example.com`;

  try {
    const organizer = await signup(baseUrl, organizerEmail, "organizer");
    const membership = await prisma.organizerMembership.findFirstOrThrow({
      where: { userId: organizer.user.id, status: "active" },
    });

    const exhibition = await prisma.exhibition.create({
      data: {
        ownerId: organizer.user.id,
        organizerId: membership.organizerId,
        name: `Registration Ticket Exhibition ${Date.now()}`,
        status: "live",
        visibility: "public",
        startDate: new Date("2027-02-01"),
        endDate: new Date("2027-02-02"),
      },
    });

    const event = await prisma.event.create({
      data: {
        organizerId: membership.organizerId,
        ownerId: organizer.user.id,
        title: exhibition.name,
        eventType: "EXHIBITION",
        status: "PUBLISHED",
        visibility: "public",
        startDate: exhibition.startDate,
        endDate: exhibition.endDate,
        exhibition: { connect: { id: exhibition.id } },
      },
    });

    await prisma.eventModuleEnablement.createMany({
      data: [
        { eventId: event.id, moduleType: "REGISTRATION", enabled: true },
        { eventId: event.id, moduleType: "TICKETING", enabled: true },
      ],
    });

    const ticketType = await prisma.ticketType.create({
      data: {
        exhibitionId: exhibition.id,
        name: "Registered Visitor",
        price: 0,
        quantity: 5,
        visible: true,
      },
    });

    const visitor = await signup(baseUrl, visitorEmail, "visitor");
    const registrationResponse = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-ticket-${Date.now()}`,
      },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Registered Ticket Visitor",
        email: visitorEmail,
        consentAccepted: true,
      }),
    });
    assert.equal(registrationResponse.status, 201);
    const registrationBody = await registrationResponse.json() as {
      registration: { id: string; status: string };
    };
    assert.equal(registrationBody.registration.status, "CONFIRMED");

    const bookingResponse = await fetch(`${baseUrl}/api/bookings/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `ticket-registration-${Date.now()}`,
      },
      body: JSON.stringify({
        exhibitionId: exhibition.id,
        ticketTypeId: ticketType.id,
        registrationId: registrationBody.registration.id,
        attendeeName: "Registered Ticket Visitor",
        attendeeEmail: visitorEmail,
        attendeePhone: "9999999999",
        quantity: 1,
        visitDate: "2027-02-01",
      }),
    });

    assert.equal(bookingResponse.status, 201);
    const bookingBody = await bookingResponse.json() as {
      booking: { eventRegistrationId: string | null; paymentStatus: string };
    };
    assert.equal(bookingBody.booking.eventRegistrationId, registrationBody.registration.id);
    assert.equal(bookingBody.booking.paymentStatus, "paid");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test("cancelled registration can explicitly re-register and reuse the registration record", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const suffix = Date.now();
  const organizerEmail = `registration-reregister-org-${suffix}@example.com`;
  const visitorEmail = `registration-reregister-visitor-${suffix}@example.com`;

  try {
    const organizer = await signup(baseUrl, organizerEmail, "organizer");
    const membership = await prisma.organizerMembership.findFirstOrThrow({
      where: { userId: organizer.user.id, status: "active" },
    });
    const event = await createPublishedEvent(organizer.user.id, membership.organizerId);

    const visitor = await signup(baseUrl, visitorEmail, "visitor");
    const firstResponse = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-reregister-first-${suffix}`,
      },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Re-registration Visitor",
        email: visitorEmail,
        consentAccepted: true,
      }),
    });
    assert.equal(firstResponse.status, 201);
    const firstBody = await firstResponse.json() as {
      registration: { id: string; status: string };
      reactivated: boolean;
    };
    assert.equal(firstBody.registration.status, "CONFIRMED");
    assert.equal(firstBody.reactivated, false);

    const cancelled = await fetch(
      `${baseUrl}/api/organizer/registrations/${firstBody.registration.id}/status`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${organizer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "CANCELLED", cancellationReason: "Visitor requested cancellation" }),
      },
    );
    assert.equal(cancelled.status, 200);

    const reRegisterResponse = await fetch(`${baseUrl}/api/registrations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${visitor.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `registration-reregister-second-${suffix}`,
      },
      body: JSON.stringify({
        eventId: event.id,
        fullName: "Re-registered Visitor",
        email: visitorEmail,
        consentAccepted: true,
      }),
    });
    assert.equal(reRegisterResponse.status, 201);
    const reRegisterBody = await reRegisterResponse.json() as {
      registration: {
        id: string;
        status: string;
        cancellationReason: string | null;
        cancelledAt: string | null;
        fullName: string;
      };
      reactivated: boolean;
    };

    assert.equal(reRegisterBody.reactivated, true);
    assert.equal(reRegisterBody.registration.id, firstBody.registration.id);
    assert.equal(reRegisterBody.registration.status, "CONFIRMED");
    assert.equal(reRegisterBody.registration.fullName, "Re-registered Visitor");
    assert.equal(reRegisterBody.registration.cancelledAt, null);
    assert.equal(reRegisterBody.registration.cancellationReason, null);

    const count = await prisma.eventRegistration.count({ where: { eventId: event.id } });
    assert.equal(count, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
