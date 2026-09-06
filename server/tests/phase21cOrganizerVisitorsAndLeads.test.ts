import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { createTicketType, cleanupOrphanPayments } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const visitorUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrphanPayments();
  await prisma.user.deleteMany({ where: { id: { in: visitorUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function bookFreeTicket(baseUrl: string, exhibitionId: string, ticketTypeId: string, label: string) {
  const email = `phase21c-visitor-${label}-${ts}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpass123", fullName: `Visitor ${label}`, userType: "visitor" }),
  }).then((r) => r.json());
  visitorUserIds.push(signup.user.id);

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${signup.token}` },
    body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: `Visitor ${label}`, attendeeEmail: email, quantity: 1 }),
  });
  return { status: res.status, body: await res.json() };
}

// -------- P1-1: Organizer Visitors --------

test("GET /api/bookings/tickets (organizer visitors data source) returns only the caller's own organizer's visitors", async () => {
  const orgA = await bootstrapOrganizer(baseUrl, "visitors-a", ts);
  organizerIds.push(orgA.organizerId);
  const orgB = await bootstrapOrganizer(baseUrl, "visitors-b", ts);
  organizerIds.push(orgB.organizerId);

  const ticketA = await createTicketType(baseUrl, orgA.token, orgA.firstExhibitionId, 0);
  const ticketB = await createTicketType(baseUrl, orgB.token, orgB.firstExhibitionId, 0);

  const bookingA = await bookFreeTicket(baseUrl, orgA.firstExhibitionId, ticketA, "org-a");
  assert.equal(bookingA.status, 201, JSON.stringify(bookingA.body));
  const bookingB = await bookFreeTicket(baseUrl, orgB.firstExhibitionId, ticketB, "org-b");
  assert.equal(bookingB.status, 201, JSON.stringify(bookingB.body));

  const resA = await fetch(`${baseUrl}/api/bookings/tickets`, { headers: { Authorization: `Bearer ${orgA.token}` } });
  const bodyA = await resA.json();
  assert.equal(resA.status, 200);
  assert.ok(bodyA.bookings.some((b: { id: string }) => b.id === bookingA.body.booking.id), "org A must see its own visitor");
  assert.ok(!bodyA.bookings.some((b: { id: string }) => b.id === bookingB.body.booking.id), "org A must NOT see org B's visitor");

  const resB = await fetch(`${baseUrl}/api/bookings/tickets`, { headers: { Authorization: `Bearer ${orgB.token}` } });
  const bodyB = await resB.json();
  assert.ok(bodyB.bookings.some((b: { id: string }) => b.id === bookingB.body.booking.id), "org B must see its own visitor");
  assert.ok(!bodyB.bookings.some((b: { id: string }) => b.id === bookingA.body.booking.id), "org B must NOT see org A's visitor");
});

test("a pure exhibitor account cannot access the organizer visitors endpoint", async () => {
  const org = await bootstrapOrganizer(baseUrl, "visitors-exhibitor-block", ts);
  organizerIds.push(org.organizerId);
  const { token: exhibitorToken } = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "visitors-pure-exhibitor", ts);

  const res = await fetch(`${baseUrl}/api/bookings/tickets`, { headers: { Authorization: `Bearer ${exhibitorToken}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.deepEqual(body.bookings, [], "a pure exhibitor has zero organizer memberships and must see an empty list, never another organizer's data");
});

// -------- P1-2: Organizer Leads --------

async function setUpConfirmedExhibitorWithLead(label: string) {
  const org = await bootstrapOrganizer(baseUrl, label, ts);
  organizerIds.push(org.organizerId);
  const { token: exhibitorToken, participationId } = await applyAsExhibitor(baseUrl, org.firstExhibitionId, `${label}-ex`, ts);
  await approveParticipation(baseUrl, org.token, org.firstExhibitionId, participationId);
  await prisma.exhibitionExhibitor.update({ where: { id: participationId }, data: { status: "confirmed" } });

  const captureRes = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${exhibitorToken}` },
    body: JSON.stringify({ exhibitionExhibitorId: participationId, visitorName: `Lead ${label}`, visitorEmail: `lead-${label}-${ts}@example.com`, source: "manual" }),
  });
  const captureBody = await captureRes.json();
  assert.equal(captureRes.status, 201, JSON.stringify(captureBody));

  return { organizer: org, exhibitorToken, participationId, leadId: captureBody.lead.id as string };
}

test("organizer A cannot see organizer B's leads via GET /api/organizer/leads", async () => {
  const a = await setUpConfirmedExhibitorWithLead("leads-a");
  const b = await setUpConfirmedExhibitorWithLead("leads-b");

  const resA = await fetch(`${baseUrl}/api/organizer/leads`, { headers: { Authorization: `Bearer ${a.organizer.token}` } });
  const bodyA = await resA.json();
  assert.equal(resA.status, 200, JSON.stringify(bodyA));
  const idsA = bodyA.leads.map((l: { id: string }) => l.id);
  assert.ok(idsA.includes(a.leadId), "organizer A must see its own tenant's lead");
  assert.ok(!idsA.includes(b.leadId), "organizer A must NOT see organizer B's lead");
});

test("organizer A cannot read organizer B's lead detail by id (IDOR), and A's own lead detail includes full context", async () => {
  const a = await setUpConfirmedExhibitorWithLead("leads-idor-a");
  const b = await setUpConfirmedExhibitorWithLead("leads-idor-b");

  const crossTenant = await fetch(`${baseUrl}/api/organizer/leads/${b.leadId}`, { headers: { Authorization: `Bearer ${a.organizer.token}` } });
  assert.equal(crossTenant.status, 404, "a cross-tenant lead id must 404, not leak data or 403");

  const ownTenant = await fetch(`${baseUrl}/api/organizer/leads/${a.leadId}`, { headers: { Authorization: `Bearer ${a.organizer.token}` } });
  const ownBody = await ownTenant.json();
  assert.equal(ownTenant.status, 200, JSON.stringify(ownBody));
  assert.ok(ownBody.lead.exhibitionExhibitor.exhibition.name, "lead detail must include exhibition context");
  assert.ok(ownBody.lead.exhibitionExhibitor.business.id, "lead detail must include exhibitor business context");
});

test("organizer A cannot export organizer B's leads", async () => {
  const a = await setUpConfirmedExhibitorWithLead("leads-export-a");
  const b = await setUpConfirmedExhibitorWithLead("leads-export-b");

  const res = await fetch(`${baseUrl}/api/organizer/leads/export`, { headers: { Authorization: `Bearer ${a.organizer.token}` } });
  assert.equal(res.status, 200);
  const csv = await res.text();
  assert.ok(!csv.includes(`lead-${"leads-export-b"}-${ts}@example.com`), "exported CSV must never contain another organizer's lead data");
  void b;
});

test("a pure exhibitor account cannot access the organizer leads endpoint", async () => {
  const org = await bootstrapOrganizer(baseUrl, "leads-exhibitor-block", ts);
  organizerIds.push(org.organizerId);
  const { token: exhibitorToken } = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "leads-pure-exhibitor", ts);

  const res = await fetch(`${baseUrl}/api/organizer/leads`, { headers: { Authorization: `Bearer ${exhibitorToken}` } });
  const body = await res.json();
  assert.equal(res.status, 403, JSON.stringify(body));
});
