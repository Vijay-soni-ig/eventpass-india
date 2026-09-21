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
      fullName: userType === "organizer" ? "Capacity Organizer" : "Capacity Visitor",
      userType,
    }),
  });
  assert.equal(response.status, 201);
  return await response.json() as { token: string; user: { id: string } };
}

test("organizer confirmation cannot exceed event registration capacity", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;
  const suffix = Date.now();

  try {
    const organizer = await signup(baseUrl, `capacity-organizer-${suffix}@example.com`, "organizer");
    const membership = await prisma.organizerMembership.findFirstOrThrow({
      where: { userId: organizer.user.id, status: "active" },
    });
    const event = await prisma.event.create({
      data: {
        organizerId: membership.organizerId,
        ownerId: organizer.user.id,
        title: `Organizer Capacity ${suffix}`,
        eventType: "CONFERENCE",
        status: "PUBLISHED",
        visibility: "public",
        startDate: new Date("2027-03-01"),
        endDate: new Date("2027-03-02"),
      },
    });

    await prisma.eventRegistrationSettings.create({
      data: { eventId: event.id, capacity: 1, enabled: true, requiresApproval: true },
    });

    const firstVisitor = await signup(baseUrl, `capacity-first-${suffix}@example.com`, "visitor");
    const secondVisitor = await signup(baseUrl, `capacity-second-${suffix}@example.com`, "visitor");

    // Public registration correctly consumes capacity for PENDING registrations,
    // so seed two pending registrations directly to exercise the organizer approval
    // boundary independently.
    const first = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: firstVisitor.user.id,
        fullName: "First Capacity Visitor",
        email: "capacity-first-" + suffix + "@example.com",
        consentAccepted: true,
        status: "PENDING",
        source: "PUBLIC",
      },
    });
    const second = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: secondVisitor.user.id,
        fullName: "Second Capacity Visitor",
        email: "capacity-second-" + suffix + "@example.com",
        consentAccepted: true,
        status: "PENDING",
        source: "PUBLIC",
      },
    });
    assert.equal(first.status, "PENDING");
    assert.equal(second.status, "PENDING");

    const confirmFirst = await fetch(`${baseUrl}/api/organizer/registrations/${first.id}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${organizer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CONFIRMED" }),
    });
    assert.equal(confirmFirst.status, 200);

    const confirmSecond = await fetch(`${baseUrl}/api/organizer/registrations/${second.id}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${organizer.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CONFIRMED" }),
    });
    assert.equal(confirmSecond.status, 409);

    const counts = await prisma.eventRegistration.groupBy({
      by: ["status"],
      where: { eventId: event.id },
      _count: { _all: true },
    });
    const confirmed = counts.find((row) => row.status === "CONFIRMED")?._count._all ?? 0;
    assert.equal(confirmed, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
