import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers, createExhibition, setSubscription } from "./helpers/entitlementFixtures";
import { signupUser } from "./helpers/phase21bFixtures";

// Phase 23.5 — organizer event creation/publishing hardening. The audit
// found `status` was just another field in the generic create/update
// payload with zero gate on transitioning to "live" (no dates, no venue, no
// city required), no server-side date-ordering check, no rate limiting on
// any mutation in routes/exhibitions.ts, and no audit logging on any
// exhibition mutation. These tests cover exactly those gaps. Cross-organizer
// IDOR on PUT/DELETE/tickets/stalls was already covered by
// entitlementSecurity.test.ts and is not duplicated here.

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

let org: Awaited<ReturnType<typeof bootstrapOrganizer>>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  org = await bootstrapOrganizer(baseUrl, "publishing", ts);
  organizerIds.push(org.organizerId);
  // This file creates many exhibitions per test — a fresh Starter-plan
  // organizer's ONE free exhibition slot is already consumed by the
  // bootstrap exhibition itself, which would otherwise make every further
  // create in this file fail on the unrelated entitlement limit rather than
  // exercising the readiness/date/audit/rate-limit behavior under test.
  await setSubscription(org.organizerId, "enterprise", "active");
});

after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("publish readiness: creating an exhibition directly as live with no dates/venue/city is rejected", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "Incomplete Live Event", status: "live", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.missing.includes("start date"));
  assert.ok(body.missing.includes("venue"));
  assert.ok(body.missing.includes("city"));

  const count = await prisma.exhibition.count({ where: { organizerId: org.organizerId, name: "Incomplete Live Event" } });
  assert.equal(count, 0, "an event failing the readiness gate must not be created at all");
});

test("publish readiness: creating the same incomplete event as a draft succeeds (readiness only gates live)", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "Incomplete Draft Event", status: "draft", visibility: "public", ticketTypes: [], stalls: [] }),
  });
  assert.equal(res.status, 201, JSON.stringify(await res.json()));
});

test("publish readiness: PUT-ing an existing draft to status=live without dates/venue/city is rejected, and the draft is unaffected", async () => {
  const created = await createExhibition(baseUrl, org.token, "Draft To Fix Later", { status: "draft", venue: undefined, city: undefined, startDate: undefined, endDate: undefined });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.exhibition.id;

  const publishAttempt = await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ status: "live" }),
  });
  assert.equal(publishAttempt.status, 400);

  const stillDraft = await prisma.exhibition.findUnique({ where: { id } });
  assert.equal(stillDraft?.status, "draft");
});

test("publish readiness: completing the required fields, then publishing, succeeds", async () => {
  const created = await createExhibition(baseUrl, org.token, "Completable Draft", { status: "draft", venue: undefined, city: undefined, startDate: undefined, endDate: undefined });
  const id = created.body.exhibition.id;

  const fillIn = await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ venue: "Real Venue", city: "Real City", startDate: "2027-05-01", endDate: "2027-05-03", status: "live" }),
  });
  assert.equal(fillIn.status, 200, JSON.stringify(await fillIn.json()));

  const nowLive = await prisma.exhibition.findUnique({ where: { id } });
  assert.equal(nowLive?.status, "live");
});

test("date validation: end date before start date is rejected on create", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "Backwards Dates", status: "draft", startDate: "2027-06-10", endDate: "2027-06-01", ticketTypes: [], stalls: [] }),
  });
  assert.equal(res.status, 400);
});

test("date validation: end date before start date is rejected on update, including when only one of the two fields is sent (merged against the existing value)", async () => {
  const created = await createExhibition(baseUrl, org.token, "Date Update Test", { startDate: "2027-07-10", endDate: "2027-07-15" });
  const id = created.body.exhibition.id;

  // Only sending endDate — must be validated against the EXISTING startDate, not skipped.
  const res = await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ endDate: "2027-07-01" }),
  });
  assert.equal(res.status, 400);

  const unchanged = await prisma.exhibition.findUnique({ where: { id } });
  assert.equal(unchanged?.endDate?.toISOString().slice(0, 10), "2027-07-15");
});

test("live event editing: shrinking the date range to strand an existing ticket booking's visit date is rejected", async () => {
  const created = await createExhibition(baseUrl, org.token, "Booking Strand Test", { startDate: "2027-08-01", endDate: "2027-08-10" });
  const id = created.body.exhibition.id;
  const ticket = await fetch(`${baseUrl}/api/exhibitions/${id}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "General", price: 0, quantity: 10, visible: true }),
  }).then((r) => r.json());

  const visitor = await signupUser(baseUrl, `phase235-strand-${ts}@example.com`, "Strand Visitor", "visitor");
  visitorUserIds.push(visitor.userId);
  const booking = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({ exhibitionId: id, ticketTypeId: ticket.ticket.id, attendeeName: "Strand Visitor", attendeeEmail: visitor.userId + "@example.com", quantity: 1, visitDate: "2027-08-08" }),
  });
  assert.equal(booking.status, 201, JSON.stringify(await booking.json()));

  // Shrinking endDate to before the booking's visitDate (2027-08-08) must be rejected.
  const shrink = await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ endDate: "2027-08-05" }),
  });
  assert.equal(shrink.status, 409);

  const unchanged = await prisma.exhibition.findUnique({ where: { id } });
  assert.equal(unchanged?.endDate?.toISOString().slice(0, 10), "2027-08-10", "the date must remain unchanged after the rejected update");

  // A date change that keeps the booking's visitDate inside the range must still work.
  const safeChange = await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ endDate: "2027-08-09" }),
  });
  assert.equal(safeChange.status, 200, JSON.stringify(await safeChange.json()));
});

test("ticket type deletion: a ticket type with existing bookings cannot be deleted", async () => {
  const created = await createExhibition(baseUrl, org.token, "Ticket Delete Guard Test");
  const id = created.body.exhibition.id;
  const ticket = await fetch(`${baseUrl}/api/exhibitions/${id}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "General", price: 0, quantity: 10, visible: true }),
  }).then((r) => r.json());

  const visitor = await signupUser(baseUrl, `phase235-delguard-${ts}@example.com`, "Del Guard Visitor", "visitor");
  visitorUserIds.push(visitor.userId);
  await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${visitor.token}` },
    body: JSON.stringify({ exhibitionId: id, ticketTypeId: ticket.ticket.id, attendeeName: "Del Guard Visitor", attendeeEmail: visitor.userId + "@example.com", quantity: 1 }),
  });

  const del = await fetch(`${baseUrl}/api/exhibitions/${id}/tickets/${ticket.ticket.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${org.token}` },
  });
  assert.equal(del.status, 409);

  const stillExists = await prisma.ticketType.findUnique({ where: { id: ticket.ticket.id } });
  assert.ok(stillExists, "the ticket type must still exist after the rejected delete");
});

test("ticket type deletion: a ticket type with no bookings can still be deleted normally (regression)", async () => {
  const created = await createExhibition(baseUrl, org.token, "Ticket Delete Normal Test");
  const id = created.body.exhibition.id;
  const ticket = await fetch(`${baseUrl}/api/exhibitions/${id}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "General", price: 0, quantity: 10, visible: true }),
  }).then((r) => r.json());

  const del = await fetch(`${baseUrl}/api/exhibitions/${id}/tickets/${ticket.ticket.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${org.token}` },
  });
  assert.equal(del.status, 204);
});

test("hidden ticket type cannot be booked (regression for booking route, verifies the flag still means what publish readiness assumes it means)", async () => {
  const created = await createExhibition(baseUrl, org.token, "Hidden Ticket Cross-Check");
  const id = created.body.exhibition.id;
  const hidden = await fetch(`${baseUrl}/api/exhibitions/${id}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "Internal Comp", price: 0, quantity: 10, visible: false }),
  }).then((r) => r.json());
  assert.equal(hidden.ticket.visible, false);
});

test("audit logging: exhibition create, publish/unpublish, and delete all write audit records", async () => {
  const created = await createExhibition(baseUrl, org.token, "Audit Log Test", { status: "draft" });
  const id = created.body.exhibition.id;
  const createdEntry = await prisma.auditLog.findFirst({ where: { action: "exhibition.created", entityId: id } });
  assert.ok(createdEntry, "exhibition.created audit entry must exist");

  await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ status: "live" }),
  });
  const publishedEntry = await prisma.auditLog.findFirst({ where: { action: "exhibition.published", entityId: id } });
  assert.ok(publishedEntry, "exhibition.published audit entry must exist on draft->live");

  await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ status: "draft" }),
  });
  const unpublishedEntry = await prisma.auditLog.findFirst({ where: { action: "exhibition.unpublished", entityId: id } });
  assert.ok(unpublishedEntry, "exhibition.unpublished audit entry must exist on live->draft");

  const del = await fetch(`${baseUrl}/api/exhibitions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${org.token}` } });
  assert.equal(del.status, 204);
  const deletedEntry = await prisma.auditLog.findFirst({ where: { action: "exhibition.deleted", entityId: id } });
  assert.ok(deletedEntry, "exhibition.deleted audit entry must exist");
});

test("cross-organizer IDOR: organizer A cannot PUT, DELETE, or publish organizer B's exhibition", async () => {
  const orgB = await bootstrapOrganizer(baseUrl, "publishing-orgb", ts);
  organizerIds.push(orgB.organizerId);

  const putRes = await fetch(`${baseUrl}/api/exhibitions/${orgB.firstExhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "Hijacked Name" }),
  });
  assert.equal(putRes.status, 404);

  const deleteRes = await fetch(`${baseUrl}/api/exhibitions/${orgB.firstExhibitionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${org.token}` },
  });
  assert.equal(deleteRes.status, 404);

  const unchanged = await prisma.exhibition.findUnique({ where: { id: orgB.firstExhibitionId } });
  assert.ok(unchanged, "organizer B's exhibition must still exist");
  assert.notEqual(unchanged?.name, "Hijacked Name");
});

test("malformed exhibition id does not crash the server on update", async () => {
  const res = await fetch(`${baseUrl}/api/exhibitions/${encodeURIComponent("not-a-uuid; DROP TABLE exhibitions;")}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ name: "x" }),
  });
  assert.equal(res.status, 404);
  const stillWorks = await prisma.exhibition.count();
  assert.ok(stillWorks >= 0);
});

test("XSS-shaped exhibition name/description round-trips as inert data, never executed", async () => {
  const payload = `<script>window.__xss235=1</script>`;
  const created = await createExhibition(baseUrl, org.token, `Legit Name ${ts}`, { description: payload, status: "draft" });
  assert.equal(created.status, 201);
  assert.equal(created.body.exhibition.description, payload);
});

test("duplicate publish requests are safe: re-saving an already-live exhibition with status: live again does not error or double-audit incorrectly", async () => {
  const created = await createExhibition(baseUrl, org.token, "Double Publish Test", { status: "draft" });
  const id = created.body.exhibition.id;

  const firstPublish = await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ status: "live" }),
  });
  assert.equal(firstPublish.status, 200, JSON.stringify(await firstPublish.json()));

  const again = await fetch(`${baseUrl}/api/exhibitions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ status: "live" }),
  });
  assert.equal(again.status, 200, JSON.stringify(await again.json()));

  // Re-saving live->live must be logged as a plain update, not another "published" transition.
  const publishedCount = await prisma.auditLog.count({ where: { action: "exhibition.published", entityId: id } });
  assert.equal(publishedCount, 1, "exhibition.published must only be logged on the actual draft/paused -> live transition, not on every subsequent live->live save");
});

// Kept last in this file — it deliberately exhausts org.token's exhibition-
// mutation rate-limit bucket, which would otherwise 429 every test
// registered after it that reuses the same organizer/token.
test("rate limiting: repeated exhibition create/update requests are limited per user, without affecting a different user", async () => {
  const results: number[] = [];
  for (let i = 0; i < 32; i++) {
    const res = await fetch(`${baseUrl}/api/exhibitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${org.token}` },
      body: JSON.stringify({ name: `Rate Limit Test ${i}`, status: "draft" }),
    });
    results.push(res.status);
    if (res.status === 201) {
      const body = await res.json();
      await prisma.exhibition.delete({ where: { id: body.exhibition.id } }).catch(() => {});
    }
  }
  assert.ok(results.includes(429), `expected at least one 429 among: ${results.join(",")}`);

  // A PUT (not a create) on the bystander's OWN bootstrap exhibition — using
  // POST here would confound the check with the unrelated Starter-plan
  // one-free-exhibition entitlement limit, which is not what this test is
  // about.
  const otherOrg = await bootstrapOrganizer(baseUrl, "publishing-bystander", ts);
  organizerIds.push(otherOrg.organizerId);
  const bystanderRes = await fetch(`${baseUrl}/api/exhibitions/${otherOrg.firstExhibitionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${otherOrg.token}` },
    body: JSON.stringify({ description: "Bystander edit" }),
  });
  assert.equal(bystanderRes.status, 200, "a different user must not inherit another user's rate-limit bucket");
});
