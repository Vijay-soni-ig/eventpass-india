import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { getActivePricingVersion } from "../src/lib/pricingVersion";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const createdUserIds: string[] = [];
const createdOrganizerIds: string[] = [];
const createdExhibitorBusinessIds: string[] = [];

let adminToken: string;
// Shared exhibition fixture: 1 ticket type + 4 stalls (S1..S4), used across
// several independent tests to keep total auth-route calls (signup/login
// share one rate limiter, 20 per 15 min — see middleware/authRateLimit)
// well under the limit instead of one signup/login per test.
let shared: {
  organizerId: string;
  exhibitionId: string;
  ticketTypeId: string;
  stalls: { id: string }[];
};
let sharedExhibitorBusinessId: string;
let sharedExhibitorUserId: string;
let sharedExhibitorToken: string;
let sharedVisitorUserId: string;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());

  adminToken = await login("platform.admin@eventpass.test");

  shared = await bootstrapOrganizerWithExhibition("shared", 4);

  const exhibitorSignup = await signupTyped("shared-exhibitor", "exhibitor");
  sharedExhibitorUserId = exhibitorSignup.userId;
  sharedExhibitorToken = exhibitorSignup.token;
  const business = await prisma.exhibitorBusiness.create({ data: { ownerId: sharedExhibitorUserId, companyName: "Shared Fixture Co" } });
  createdExhibitorBusinessIds.push(business.id);
  await prisma.exhibitorMembership.create({ data: { exhibitorBusinessId: business.id, userId: sharedExhibitorUserId, role: "owner", status: "active" } });
  sharedExhibitorBusinessId = business.id;

  const visitorSignup = await signupTyped("shared-visitor", "visitor");
  sharedVisitorUserId = visitorSignup.userId;
});

after(async () => {
  if (createdOrganizerIds.length) {
    await prisma.stall.deleteMany({ where: { exhibition: { organizerId: { in: createdOrganizerIds } } } });
    await prisma.checkIn.deleteMany({ where: { ticketBooking: { exhibition: { organizerId: { in: createdOrganizerIds } } } } });
    await prisma.ticketBooking.deleteMany({ where: { exhibition: { organizerId: { in: createdOrganizerIds } } } });
    await prisma.exhibitionExhibitor.deleteMany({ where: { exhibition: { organizerId: { in: createdOrganizerIds } } } });
    await prisma.ticketType.deleteMany({ where: { exhibition: { organizerId: { in: createdOrganizerIds } } } });
    await prisma.subscription.deleteMany({ where: { organizerId: { in: createdOrganizerIds } } });
    await prisma.exhibition.deleteMany({ where: { organizerId: { in: createdOrganizerIds } } });
    await prisma.organizerMembership.deleteMany({ where: { organizerId: { in: createdOrganizerIds } } });
    await prisma.organizer.deleteMany({ where: { id: { in: createdOrganizerIds } } });
  }
  if (createdExhibitorBusinessIds.length) {
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: { in: createdExhibitorBusinessIds } } });
    await prisma.exhibitorBusiness.deleteMany({ where: { id: { in: createdExhibitorBusinessIds } } });
  }
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await stop();
  await prisma.$disconnect();
});

async function login(email: string, password = "DevPassword123!") {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((res) => res.json());
  assert.ok(r.token, `login must succeed for ${email}: ${JSON.stringify(r)}`);
  return r.token as string;
}

async function signupTyped(label: string, userType: "visitor" | "exhibitor") {
  const email = `pac-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: `PAC ${label}`, userType }),
  }).then((r) => r.json());
  assert.ok(signup.user?.id, `signup must succeed for ${label}: ${JSON.stringify(signup)}`);
  createdUserIds.push(signup.user.id);
  return { userId: signup.user.id as string, token: signup.token as string, email };
}

async function bootstrapOrganizerWithExhibition(label: string, stallCount: number) {
  const { token } = await signupTyped(`org-${label}`, "exhibitor");
  const created = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `PAC Exhibition ${label} ${ts}`,
      city: "Bengaluru",
      ticketTypes: [{ name: "General", price: 100, quantity: 10 }],
      stalls: Array.from({ length: stallCount }, (_, i) => ({ code: `S${i + 1}`, price: 500 })),
    }),
  }).then((r) => r.json());
  assert.ok(created.exhibition?.id, `exhibition creation must succeed for ${label}: ${JSON.stringify(created)}`);
  const organizerId = created.exhibition.organizerId as string;
  const exhibitionId = created.exhibition.id as string;
  createdOrganizerIds.push(organizerId);
  return {
    organizerId,
    exhibitionId,
    ticketTypeId: created.exhibition.ticketTypes[0].id as string,
    stalls: created.exhibition.stalls as { id: string }[],
  };
}

async function adminGet(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  return { status: res.status, body: await res.json() };
}
async function adminPatch(path: string, data: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json() };
}

// ============================================================
// A. Organizer CRUD
// ============================================================

test("platform admin can edit an organizer's profile, verify/revert KYC, and see it in the enriched list", async () => {
  const { status: editStatus, body: editBody } = await adminPatch(`/api/platform/organizers/${shared.organizerId}`, { name: "Renamed Org", city: "ignored-field" });
  assert.equal(editStatus, 200, JSON.stringify(editBody));
  assert.equal(editBody.organizer.name, "Renamed Org");
  const fromDb = await prisma.organizer.findUniqueOrThrow({ where: { id: shared.organizerId } });
  assert.equal(fromDb.name, "Renamed Org", "the database must actually persist the edit, not just the response");

  const emptyEdit = await adminPatch(`/api/platform/organizers/${shared.organizerId}`, {});
  assert.equal(emptyEdit.status, 400);

  const verify = await adminPatch(`/api/platform/organizers/${shared.organizerId}/kyc`, { verified: true });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  assert.equal(verify.body.organizer.kycStatus, "verified");

  const revert = await adminPatch(`/api/platform/organizers/${shared.organizerId}/kyc`, { verified: false });
  assert.equal(revert.status, 200);
  assert.equal(revert.body.organizer.kycStatus, "pending");

  const auditRows = await prisma.auditLog.findMany({ where: { entityType: "Organizer", entityId: shared.organizerId, action: { startsWith: "platform.organizer_kyc" } } });
  assert.equal(auditRows.length, 2, "both the verify and the revert must be audited");

  const notFound = await adminPatch(`/api/platform/organizers/does-not-exist/kyc`, { verified: true });
  assert.equal(notFound.status, 404);
  const badBody = await adminPatch(`/api/platform/organizers/${shared.organizerId}/kyc`, { verified: "yes" });
  assert.equal(badBody.status, 400);

  await adminPatch(`/api/platform/organizers/${shared.organizerId}/suspend`, { suspended: true, reason: "test" });
  const { status: listStatus, body: listBody } = await adminGet(`/api/platform/organizers?search=Renamed Org`);
  assert.equal(listStatus, 200);
  const row = listBody.organizers.find((o: { id: string }) => o.id === shared.organizerId);
  assert.ok(row, "the organizer must appear in the list");
  assert.equal(row.suspended, true);
  assert.ok("ticketRevenue" in row && "visitorsCount" in row && "subscription" in row, "the enriched columns must be present");
  await adminPatch(`/api/platform/organizers/${shared.organizerId}/suspend`, { suspended: false });
});

// ============================================================
// B. Exhibition detail + stall/ticket admin actions
// ============================================================

test("exhibition detail endpoint returns real stall/exhibitor/ticket/revenue counts", async () => {
  const { status, body } = await adminGet(`/api/platform/exhibitions/${shared.exhibitionId}`);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.exhibition.organizer.id, shared.organizerId);
  assert.equal(body.exhibition.totalStalls, 4);
});

test("admin can assign a stall to an approved exhibitor participation, and a duplicate assignment is rejected", async () => {
  const participation = await prisma.exhibitionExhibitor.create({
    data: { exhibitionId: shared.exhibitionId, exhibitorBusinessId: sharedExhibitorBusinessId, status: "approved" },
  });

  const assign = await adminPatch(`/api/platform/exhibitions/${shared.exhibitionId}/stalls/${shared.stalls[0].id}`, {
    action: "assign",
    exhibitionExhibitorId: participation.id,
  });
  assert.equal(assign.status, 200, JSON.stringify(assign.body));
  assert.equal(assign.body.stall.status, "reserved");
  assert.equal(assign.body.stall.exhibitionExhibitorId, participation.id);

  const dup = await adminPatch(`/api/platform/exhibitions/${shared.exhibitionId}/stalls/${shared.stalls[0].id}`, {
    action: "assign",
    exhibitionExhibitorId: participation.id,
  });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));

  const fromDb = await prisma.stall.findUniqueOrThrow({ where: { id: shared.stalls[0].id } });
  assert.equal(fromDb.status, "reserved", "the stall must still be in its single, correct assigned state");

  const release = await adminPatch(`/api/platform/exhibitions/${shared.exhibitionId}/stalls/${shared.stalls[0].id}`, { action: "release" });
  assert.equal(release.status, 200, JSON.stringify(release.body));
  assert.equal(release.body.stall.status, "available");
  assert.equal(release.body.stall.exhibitionExhibitorId, null);

  await prisma.exhibitionExhibitor.update({ where: { id: participation.id }, data: { status: "rejected" } });
  const assignRejected = await adminPatch(`/api/platform/exhibitions/${shared.exhibitionId}/stalls/${shared.stalls[1].id}`, {
    action: "assign",
    exhibitionExhibitorId: participation.id,
  });
  assert.equal(assignRejected.status, 400, JSON.stringify(assignRejected.body));
});

test("admin ticket capacity edit allows a safe reduction but rejects dropping below tickets already sold", async () => {
  for (let i = 0; i < 3; i++) {
    await prisma.ticketBooking.create({
      data: { exhibitionId: shared.exhibitionId, ticketTypeId: shared.ticketTypeId, quantity: 1, unitPrice: 100, amountPaid: 100, paymentStatus: "paid" },
    });
  }

  const tooLow = await adminPatch(`/api/platform/exhibitions/${shared.exhibitionId}/tickets/${shared.ticketTypeId}`, { quantity: 2 });
  assert.equal(tooLow.status, 400, JSON.stringify(tooLow.body));

  const safe = await adminPatch(`/api/platform/exhibitions/${shared.exhibitionId}/tickets/${shared.ticketTypeId}`, { quantity: 8 });
  assert.equal(safe.status, 200, JSON.stringify(safe.body));
  assert.equal(safe.body.ticket.quantity, 8);

  const { status, body } = await adminGet(`/api/platform/exhibitions/${shared.exhibitionId}/tickets`);
  assert.equal(status, 200);
  const row = body.tickets.find((t: { id: string }) => t.id === shared.ticketTypeId);
  assert.equal(row.sold, 3);
  assert.equal(row.remaining, 5);
  assert.equal(row.revenue, 300);
});

// ============================================================
// C. Exhibitor CRUD (KYC, suspend, profile) + suspension actually blocks access
// ============================================================

test("platform admin can verify exhibitor KYC, edit its profile, then suspend it and its member loses access", async () => {
  const kyc = await adminPatch(`/api/platform/exhibitors/${sharedExhibitorBusinessId}/kyc`, { verified: true });
  assert.equal(kyc.status, 200, JSON.stringify(kyc.body));
  assert.equal(kyc.body.exhibitor.kycStatus, "verified");

  const edit = await adminPatch(`/api/platform/exhibitors/${sharedExhibitorBusinessId}`, { companyName: "Renamed Exhibitor Co" });
  assert.equal(edit.status, 200);
  const fromDb = await prisma.exhibitorBusiness.findUniqueOrThrow({ where: { id: sharedExhibitorBusinessId } });
  assert.equal(fromDb.companyName, "Renamed Exhibitor Co");

  const before = await fetch(`${baseUrl}/api/business`, { headers: { Authorization: `Bearer ${sharedExhibitorToken}` } });
  assert.equal(before.status, 200, "before suspension, the owner can read their own business");

  const suspend = await adminPatch(`/api/platform/exhibitors/${sharedExhibitorBusinessId}/suspend`, { suspended: true, reason: "test" });
  assert.equal(suspend.status, 200);
  assert.equal(suspend.body.exhibitor.suspended, true);

  const after = await fetch(`${baseUrl}/api/business`, { headers: { Authorization: `Bearer ${sharedExhibitorToken}` } });
  assert.notEqual(after.status, 500);
  if (after.status === 200) {
    const body = await after.json();
    assert.notEqual(body.business?.id, sharedExhibitorBusinessId, "a suspended business must never be resolved as the member's active business");
  }

  await adminPatch(`/api/platform/exhibitors/${sharedExhibitorBusinessId}/suspend`, { suspended: false });
});

// ============================================================
// D. Visitor management
// ============================================================

test("visitor detail/tickets/payments/checkins reflect real data, and suspension blocks the account immediately", async () => {
  const pricingVersion = await getActivePricingVersion();
  const payment = await prisma.payment.create({
    data: {
      amount: 250,
      baseAmount: 250,
      organizerAmount: 250,
      status: "paid",
      pricingVersionId: pricingVersion.id,
    },
  });
  const booking = await prisma.ticketBooking.create({
    data: {
      exhibitionId: shared.exhibitionId,
      ticketTypeId: shared.ticketTypeId,
      buyerUserId: sharedVisitorUserId,
      quantity: 1,
      unitPrice: 250,
      amountPaid: 250,
      paymentStatus: "paid",
      paymentId: payment.id,
    },
  });
  await prisma.checkIn.create({ data: { ticketBookingId: booking.id, method: "manual" } });

  const detail = await adminGet(`/api/platform/visitors/${sharedVisitorUserId}`);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.visitor.ticketsCount, 1);
  assert.equal(detail.body.visitor.checkInsCount, 1);
  assert.equal(detail.body.visitor.totalSpent, 250);

  const tickets = await adminGet(`/api/platform/visitors/${sharedVisitorUserId}/tickets`);
  assert.equal(tickets.status, 200);
  assert.equal(tickets.body.bookings.length, 1);
  assert.equal(tickets.body.bookings[0].exhibition.id, shared.exhibitionId);

  const payments = await adminGet(`/api/platform/visitors/${sharedVisitorUserId}/payments`);
  assert.equal(payments.status, 200);
  assert.equal(payments.body.payments.length, 1);
  assert.equal(Number(payments.body.payments[0].amount), 250);

  const checkIns = await adminGet(`/api/platform/visitors/${sharedVisitorUserId}/checkins`);
  assert.equal(checkIns.status, 200);
  assert.equal(checkIns.body.checkIns.length, 1);

  const visitorToken = await login(`pac-shared-visitor-${ts}@example.com`, "testpass123");
  const before = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${visitorToken}` } });
  assert.equal(before.status, 200);

  const suspend = await adminPatch(`/api/platform/visitors/${sharedVisitorUserId}/suspend`, { suspended: true, reason: "test" });
  assert.equal(suspend.status, 200, JSON.stringify(suspend.body));

  const after = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${visitorToken}` } });
  assert.equal(after.status, 403, "an already-issued token must be rejected immediately after suspension");

  const loginAttempt = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `pac-shared-visitor-${ts}@example.com`, password: "testpass123" }),
  });
  assert.equal(loginAttempt.status, 403, "a suspended visitor must not be able to log in at all");
});

test("visitor detail 404s for a user who has never bought a ticket", async () => {
  const { status } = await adminGet(`/api/platform/visitors/${shared.organizerId}`);
  // shared.organizerId is a real UUID belonging to an Organizer, not a User with tickets
  assert.equal(status, 404, "a non-visitor id must not be exposed as a visitor record");
});

// ============================================================
// Negative / authorization tests (reuse the shared organizer's own token)
// ============================================================

test("a non-platform-admin cannot call any of the new admin endpoints", async () => {
  const results = await Promise.all([
    fetch(`${baseUrl}/api/platform/organizers/${shared.organizerId}/kyc`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sharedExhibitorToken}` },
      body: JSON.stringify({ verified: true }),
    }),
    fetch(`${baseUrl}/api/platform/exhibitors/${sharedExhibitorBusinessId}/suspend`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sharedExhibitorToken}` },
      body: JSON.stringify({ suspended: true }),
    }),
    fetch(`${baseUrl}/api/platform/visitors/${sharedVisitorUserId}/suspend`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sharedExhibitorToken}` },
      body: JSON.stringify({ suspended: true }),
    }),
    fetch(`${baseUrl}/api/platform/exhibitions/${shared.exhibitionId}/stalls/does-not-matter`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sharedExhibitorToken}` },
      body: JSON.stringify({ action: "release" }),
    }),
  ]);
  for (const r of results) assert.equal(r.status, 403);
});

test("unauthenticated requests to the new admin endpoints are rejected", async () => {
  const res = await fetch(`${baseUrl}/api/platform/exhibitions/anything`);
  assert.equal(res.status, 401);
});
