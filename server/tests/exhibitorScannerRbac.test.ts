import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

const ts = Date.now();
const password = "TestPassword123!";
let baseUrl: string;
let stop: () => Promise<void>;
const userIds: string[] = [];
const organizerIds: string[] = [];
const exhibitionIds: string[] = [];
const businessIds: string[] = [];
const participationIds: string[] = [];
const ticketTypeIds: string[] = [];
const bookingIds: string[] = [];

type User = { id: string; token: string };

async function signup(email: string, userType: "visitor" | "organizer" | "exhibitor"): Promise<User> {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": email },
    body: JSON.stringify({ email, password, fullName: email.split("@")[0], userType }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  userIds.push(body.user.id);
  return { id: body.user.id, token: body.token };
}

async function createFixture(label: string) {
  const organizer = await signup(`ex-scanner-org-${label}-${ts}@example.com`, "organizer");
  const membership = await prisma.organizerMembership.findFirstOrThrow({
    where: { userId: organizer.id, role: "owner", status: "active" },
    select: { organizerId: true },
  });
  organizerIds.push(membership.organizerId);

  const exhibition = await prisma.exhibition.create({
    data: {
      ownerId: organizer.id,
      organizerId: membership.organizerId,
      name: `Exhibitor Scanner ${label}`,
      status: "live",
      visibility: "public",
    },
  });
  exhibitionIds.push(exhibition.id);

  const ticketType = await prisma.ticketType.create({
    data: { exhibitionId: exhibition.id, name: "General", price: 0, quantity: 100, visible: true },
  });
  ticketTypeIds.push(ticketType.id);

  const visitor = await signup(`ex-scanner-visitor-${label}-${ts}@example.com`, "visitor");
  const booking = await prisma.ticketBooking.create({
    data: {
      exhibitionId: exhibition.id,
      ticketTypeId: ticketType.id,
      buyerUserId: visitor.id,
      attendeeName: "Scanner Visitor",
      attendeeEmail: `${visitor.id}@example.com`,
      quantity: 1,
      unitPrice: 0,
      amountPaid: 0,
      paymentStatus: "paid",
    },
  });
  bookingIds.push(booking.id);

  const exhibitor = await signup(`ex-scanner-exhibitor-${label}-${ts}@example.com`, "exhibitor");
  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: exhibitor.id, companyName: `Scanner Business ${label}` },
  });
  businessIds.push(business.id);
  await prisma.exhibitorMembership.create({
    data: { exhibitorBusinessId: business.id, userId: exhibitor.id, role: "owner", status: "active" },
  });
  const participation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId: exhibition.id, exhibitorBusinessId: business.id, status: "confirmed", confirmedAt: new Date() },
  });
  participationIds.push(participation.id);

  return { organizer, exhibitor, visitor, exhibition, booking };
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    if (bookingIds.length) await prisma.checkIn.deleteMany({ where: { ticketBookingId: { in: bookingIds } } });
    if (bookingIds.length) await prisma.ticketBooking.deleteMany({ where: { id: { in: bookingIds } } });
    if (participationIds.length) await prisma.exhibitionExhibitor.deleteMany({ where: { id: { in: participationIds } } });
    if (ticketTypeIds.length) await prisma.ticketType.deleteMany({ where: { id: { in: ticketTypeIds } } });
    if (exhibitionIds.length) await prisma.exhibition.deleteMany({ where: { id: { in: exhibitionIds } } });
    if (businessIds.length) {
      await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: businessIds } } });
      await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: businessIds } } });
    }
    if (organizerIds.length) await prisma.organizerMembership.deleteMany({ where: { organizerId: { in: organizerIds } } });
    if (organizerIds.length) await prisma.organizer.deleteMany({ where: { id: { in: organizerIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await stop();
  }
});

test("exhibitor scanner: confirmed exhibitor can look up and check in a paid ticket", async () => {
  const fixture = await createFixture("authorized");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${fixture.exhibitor.token}` };

  const lookup = await fetch(`${baseUrl}/api/exhibitor/scanner/lookup/${fixture.booking.qrCode}`, { headers });
  assert.equal(lookup.status, 200, JSON.stringify(await lookup.json()));

  const checkIn = await fetch(`${baseUrl}/api/exhibitor/scanner/tickets/${fixture.booking.id}/check-in`, {
    method: "PATCH", headers, body: JSON.stringify({}),
  });
  assert.equal(checkIn.status, 200, JSON.stringify(await checkIn.json()));
  assert.equal((await prisma.ticketBooking.findUniqueOrThrow({ where: { id: fixture.booking.id } })).checkInStatus, true);
});

test("exhibitor scanner: unrelated exhibitor cannot access another exhibitor's exhibition", async () => {
  const fixture = await createFixture("isolation");
  const other = await signup(`ex-scanner-other-${ts}@example.com`, "exhibitor");
  const business = await prisma.exhibitorBusiness.create({ data: { ownerId: other.id, companyName: "Other Business" } });
  businessIds.push(business.id);
  await prisma.exhibitorMembership.create({ data: { exhibitorBusinessId: business.id, userId: other.id, role: "owner", status: "active" } });

  const res = await fetch(`${baseUrl}/api/exhibitor/scanner/lookup/${fixture.booking.qrCode}`, {
    headers: { Authorization: `Bearer ${other.token}` },
  });
  assert.equal(res.status, 404, JSON.stringify(await res.json()));
});

test("exhibitor scanner: visitor without exhibitor membership is denied", async () => {
  const fixture = await createFixture("visitor");
  const res = await fetch(`${baseUrl}/api/exhibitor/scanner/lookup/${fixture.booking.qrCode}`, {
    headers: { Authorization: `Bearer ${fixture.visitor.token}` },
  });
  assert.equal(res.status, 404, JSON.stringify(await res.json()));
});

test("exhibitor scanner: suspended exhibitor business loses scanner access", async () => {
  const fixture = await createFixture("suspended");
  const business = await prisma.exhibitorBusiness.findFirstOrThrow({ where: { ownerId: fixture.exhibitor.id } });
  await prisma.exhibitorBusiness.update({ where: { id: business.id }, data: { suspended: true, suspendedAt: new Date(), suspendedReason: "scanner RBAC test" } });

  const res = await fetch(`${baseUrl}/api/exhibitor/scanner/lookup/${fixture.booking.qrCode}`, {
    headers: { Authorization: `Bearer ${fixture.exhibitor.token}` },
  });
  assert.equal(res.status, 404, JSON.stringify(await res.json()));
});

test("exhibitor scanner: duplicate check-in is rejected", async () => {
  const fixture = await createFixture("duplicate");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${fixture.exhibitor.token}` };
  const first = await fetch(`${baseUrl}/api/exhibitor/scanner/tickets/${fixture.booking.id}/check-in`, { method: "PATCH", headers, body: "{}" });
  assert.equal(first.status, 200, JSON.stringify(await first.json()));

  const second = await fetch(`${baseUrl}/api/exhibitor/scanner/tickets/${fixture.booking.id}/check-in`, { method: "PATCH", headers, body: "{}" });
  assert.equal(second.status, 409, JSON.stringify(await second.json()));
});

test("exhibitor scanner: staff cannot force a duplicate check-in", async () => {
  const fixture = await createFixture("staff-override");
  const staff = await signup(`ex-scanner-staff-${ts}@example.com`, "exhibitor");
  await prisma.exhibitorMembership.create({
    data: { exhibitorBusinessId: businessIds[businessIds.length - 1], userId: staff.id, role: "staff", status: "active" },
  });
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${staff.token}` };
  const first = await fetch(`${baseUrl}/api/exhibitor/scanner/tickets/${fixture.booking.id}/check-in`, { method: "PATCH", headers, body: "{}" });
  assert.equal(first.status, 200, JSON.stringify(await first.json()));
  const second = await fetch(`${baseUrl}/api/exhibitor/scanner/tickets/${fixture.booking.id}/check-in`, { method: "PATCH", headers, body: JSON.stringify({ force: true }) });
  assert.equal(second.status, 403, JSON.stringify(await second.json()));
});
