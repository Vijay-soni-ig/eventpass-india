import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
  await prisma.$disconnect();
});

async function signup(
  email: string,
  userType: "organizer" | "visitor",
) {
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "TestPassword123!",
      fullName: `P0 Ticket Concurrency ${userType}`,
      userType,
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body as { token: string; user: { id: string } };
}

test("ticket reservation concurrency never exceeds ticket capacity", async () => {
  const suffix = Date.now();

  const organizer = await signup(
    `p0-ticket-concurrency-org-${suffix}@example.com`,
    "organizer",
  );
  const visitorA = await signup(
    `p0-ticket-concurrency-a-${suffix}@example.com`,
    "visitor",
  );
  const visitorB = await signup(
    `p0-ticket-concurrency-b-${suffix}@example.com`,
    "visitor",
  );

  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: organizer.user.id, status: "active" },
  });

  const event = await prisma.event.create({
    data: {
      organizerId: membership.organizerId,
      ownerId: organizer.user.id,
      title: `P0 Ticket Concurrency ${suffix}`,
      eventType: "CONFERENCE",
      status: "PUBLISHED",
      visibility: "public",
      startDate: new Date("2030-01-01T10:00:00Z"),
      endDate: new Date("2030-01-01T18:00:00Z"),
      moduleEnablements: {
        create: [{ moduleType: "TICKETING", enabled: true }],
      },
    },
  });

  const ticket = await prisma.eventTicketType.create({
    data: {
      eventId: event.id,
      name: "Concurrency Ticket",
      price: 0,
      currency: "INR",
      capacity: 1,
      maxPerOrder: 1,
      maxPerAttendee: 1,
      status: "ACTIVE",
    },
  });

  try {
    const reserve = (token: string, email: string, key: string) =>
      fetch(`${baseUrl}/api/event-ticket-reservations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          eventTicketTypeId: ticket.id,
          attendeeName: "Concurrency Visitor",
          attendeeEmail: email,
          quantity: 1,
        }),
      });

    const results = await Promise.all([
      reserve(
        visitorA.token,
        `p0-ticket-concurrency-a-${suffix}@example.com`,
        `p0-ticket-concurrency-a-${suffix}`,
      ),
      reserve(
        visitorB.token,
        `p0-ticket-concurrency-b-${suffix}@example.com`,
        `p0-ticket-concurrency-b-${suffix}`,
      ),
    ]);

    const statuses = results.map((response) => response.status).sort((a, b) => a - b);
    assert.deepEqual(
      statuses,
      [201, 409],
      "exactly one concurrent reservation must consume the single available ticket",
    );

    const active = await prisma.eventTicketReservation.aggregate({
      where: {
        eventTicketTypeId: ticket.id,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      _sum: { quantity: true },
    });

    assert.equal(
      active._sum.quantity ?? 0,
      1,
      "persisted active reservation quantity must never exceed capacity",
    );
  } finally {
    await prisma.eventTicketReservation.deleteMany({
      where: { eventTicketTypeId: ticket.id },
    });
    await prisma.eventTicketType.delete({ where: { id: ticket.id } });
    await prisma.eventModuleEnablement.deleteMany({
      where: { eventId: event.id },
    });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.organizerMembership.deleteMany({
      where: { organizerId: membership.organizerId },
    });
    await prisma.organizer.delete({
      where: { id: membership.organizerId },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            organizer.user.id,
            visitorA.user.id,
            visitorB.user.id,
          ],
        },
      },
    });
  }
});
