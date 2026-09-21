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
      fullName: userType === "organizer" ? "Analytics Organizer" : "Analytics Visitor",
      userType,
    }),
  });
  assert.equal(response.status, 201);
  return await response.json() as { token: string; user: { id: string } };
}

test("organizer registration analytics is event-scoped and returns lifecycle metrics", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const suffix = Date.now();

  try {
    const organizer = await signup(baseUrl, `registration-analytics-org-${suffix}@example.com`, "organizer");
    const membership = await prisma.organizerMembership.findFirstOrThrow({
      where: { userId: organizer.user.id, status: "active" },
    });

    const event = await prisma.event.create({
      data: {
        organizerId: membership.organizerId,
        ownerId: organizer.user.id,
        title: `Registration Analytics ${suffix}`,
        eventType: "CONFERENCE",
        status: "PUBLISHED",
        visibility: "public",
        startDate: new Date("2027-04-01"),
        endDate: new Date("2027-04-02"),
      },
    });

    await prisma.eventRegistrationSettings.create({
      data: { eventId: event.id, enabled: true, capacity: 5, requiresApproval: true },
    });

    await prisma.eventRegistration.createMany({
      data: [
        {
          eventId: event.id,
          fullName: "Confirmed Visitor",
          email: `confirmed-${suffix}@example.com`,
          consentAccepted: true,
          status: "CONFIRMED",
          source: "PUBLIC",
          registeredAt: new Date("2027-03-01T10:00:00Z"),
          confirmedAt: new Date("2027-03-01T10:05:00Z"),
        },
        {
          eventId: event.id,
          fullName: "Pending Visitor",
          email: `pending-${suffix}@example.com`,
          consentAccepted: true,
          status: "PENDING",
          source: "PUBLIC",
          registeredAt: new Date("2027-03-02T10:00:00Z"),
        },
        {
          eventId: event.id,
          fullName: "Cancelled Visitor",
          email: `cancelled-${suffix}@example.com`,
          consentAccepted: true,
          status: "CANCELLED",
          source: "PUBLIC",
          registeredAt: new Date("2027-03-03T10:00:00Z"),
          cancelledAt: new Date("2027-03-03T10:05:00Z"),
        },
      ],
    });

    const response = await fetch(`${baseUrl}/api/organizer/registrations/analytics/${event.id}`, {
      headers: { Authorization: `Bearer ${organizer.token}` },
    });
    assert.equal(response.status, 200);

    const body = await response.json() as {
      totals: { total: number; pending: number; confirmed: number; cancelled: number };
      capacity: { configured: number | null; utilization: number | null };
      approvalRate: number;
      trend: Array<{ date: string; registrations: number }>;
    };

    assert.deepEqual(body.totals, { total: 3, pending: 1, confirmed: 1, cancelled: 1 });
    assert.equal(body.capacity.configured, 5);
    // Pending registrations reserve capacity, so utilization reflects both
    // reserved (PENDING) and confirmed registrations.
    assert.equal(body.capacity.utilization, 40);
    assert.equal(body.approvalRate, 33.33);
    assert.equal(body.trend.length, 30);
    assert.ok(body.trend.every((point) => point.registrations >= 0));

    const otherEvent = await prisma.event.create({
      data: {
        organizerId: membership.organizerId,
        ownerId: organizer.user.id,
        title: `Other Registration Analytics ${suffix}`,
        eventType: "CONFERENCE",
        status: "PUBLISHED",
        visibility: "public",
        startDate: new Date("2027-05-01"),
        endDate: new Date("2027-05-02"),
      },
    });

    const otherResponse = await fetch(`${baseUrl}/api/organizer/registrations/analytics/${otherEvent.id}`, {
      headers: { Authorization: `Bearer ${organizer.token}` },
    });
    assert.equal(otherResponse.status, 200);
    const otherBody = await otherResponse.json() as { totals: { total: number } };
    assert.equal(otherBody.totals.total, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
