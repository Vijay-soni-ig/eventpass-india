import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, applyAsExhibitor, approveParticipation, createStall, cleanupOrganizers } from "./helpers/entitlementFixtures";
import { selectStall, initiatePayment, mockComplete, createTicketType, signupUser, lookupTicketAsExhibitor, checkInAsExhibitor, cleanupOrphanPayments } from "./helpers/phase21bFixtures";

let baseUrl: string;
let stop: () => Promise<void>;
const ts = Date.now();
const organizerIds: string[] = [];
const extraUserIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrphanPayments();
  await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

async function bookTicket(exhibitionId: string, ticketTypeId: string, token: string, email: string) {
  const res = await fetch(`${baseUrl}/api/bookings/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ exhibitionId, ticketTypeId, attendeeName: "Visitor", attendeeEmail: email, quantity: 1 }),
  });
  return { status: res.status, body: await res.json() };
}

async function organizerRefund(organizerToken: string, paymentId: string, idempotencyKey: string) {
  const req = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ reason: "CUSTOMER_REQUEST", idempotencyKey }),
  });
  const body = await req.json();
  assert.equal(req.status, 201, JSON.stringify(body));
  const complete = await fetch(`${baseUrl}/api/organizer/payments/${paymentId}/refunds/${body.refund.id}/mock-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizerToken}` },
    body: JSON.stringify({ outcome: "success" }),
  });
  assert.equal(complete.status, 200, JSON.stringify(await complete.json()));
  return body;
}

// ---------------------------------------------------------------------------
// Phase 21E — the full cross-persona lifecycle, traced with real assertions
// at every seam an organizer/exhibitor/visitor can observe: not "does the
// endpoint return 200" but "does every persona's own view of the same
// underlying entity agree, at every step, including after refunds."
// ---------------------------------------------------------------------------
test("organizer -> exhibitor -> visitor -> scanner -> lead -> analytics lifecycle stays consistent across all three personas, including refunds", async () => {
  // -------- Setup: organizer creates the exhibition, a limited ticket type, and a stall --------
  const org = await bootstrapOrganizer(baseUrl, "e2e", ts);
  organizerIds.push(org.organizerId);
  const ticketTypeId = await createTicketType(baseUrl, org.token, org.firstExhibitionId, 500);
  // createTicketType defaults to quantity 1000; tighten it to 2 to exercise real capacity limits.
  await prisma.ticketType.update({ where: { id: ticketTypeId }, data: { quantity: 2 } });
  const stall = await createStall(baseUrl, org.token, org.firstExhibitionId, 4000);
  assert.equal(stall.status, 201, JSON.stringify(stall.body));

  // -------- Organizer -> Exhibitor: apply, approve, allocate, pay, confirm --------
  const ex = await applyAsExhibitor(baseUrl, org.firstExhibitionId, "e2e-exhibitor", ts);

  const applicationsBeforeApproval = await fetch(`${baseUrl}/api/exhibitions/${org.firstExhibitionId}/exhibitors`, {
    headers: { Authorization: `Bearer ${org.token}` },
  }).then((r) => r.json());
  assert.ok(
    applicationsBeforeApproval.participants.some((p: { id: string; status: string }) => p.id === ex.participationId && p.status === "applied"),
    "organizer must see the exhibitor's application in 'applied' status"
  );

  const approve = await approveParticipation(baseUrl, org.token, org.firstExhibitionId, ex.participationId);
  assert.equal(approve.status, 200, JSON.stringify(approve.body));

  const exhibitorViewAfterApproval = await fetch(`${baseUrl}/api/exhibitor/participations`, {
    headers: { Authorization: `Bearer ${ex.token}` },
  }).then((r) => r.json());
  assert.equal(
    exhibitorViewAfterApproval.participations.find((p: { id: string }) => p.id === ex.participationId)?.status,
    "approved",
    "exhibitor must immediately see the approved state (no manual DB poke needed)"
  );

  const reserve = await selectStall(baseUrl, ex.token, ex.participationId, stall.body.stall.id);
  assert.equal(reserve.status, 200, JSON.stringify(reserve.body));

  // Organizer's own stall view must show the same allocation the exhibitor just made.
  const organizerExhibition = await fetch(`${baseUrl}/api/exhibitions/${org.firstExhibitionId}`, {
    headers: { Authorization: `Bearer ${org.token}` },
  }).then((r) => r.json());
  const organizerStallView = organizerExhibition.exhibition.stalls.find((s: { id: string }) => s.id === stall.body.stall.id);
  assert.equal(organizerStallView.status, "reserved");
  assert.equal(organizerStallView.exhibitionExhibitorId, ex.participationId, "organizer must see the stall allocated to the correct participation");

  const pay = await initiatePayment(baseUrl, ex.token, ex.participationId);
  assert.equal(pay.status, 201, JSON.stringify(pay.body));
  const completePayment = await mockComplete(baseUrl, ex.token, pay.body.payment.id, "success");
  assert.equal(completePayment.status, 200, JSON.stringify(completePayment.body));

  // Both personas must now agree the participation is confirmed and the stall is sold.
  const exhibitorViewConfirmed = await fetch(`${baseUrl}/api/exhibitor/participations`, {
    headers: { Authorization: `Bearer ${ex.token}` },
  }).then((r) => r.json());
  assert.equal(exhibitorViewConfirmed.participations.find((p: { id: string }) => p.id === ex.participationId)?.status, "confirmed");

  const organizerExhibitionAfterPay = await fetch(`${baseUrl}/api/exhibitions/${org.firstExhibitionId}`, {
    headers: { Authorization: `Bearer ${org.token}` },
  }).then((r) => r.json());
  const stallAfterPay = organizerExhibitionAfterPay.exhibition.stalls.find((s: { id: string }) => s.id === stall.body.stall.id);
  assert.equal(stallAfterPay.status, "sold", "organizer must see the stall as sold once the exhibitor's payment is confirmed");

  const dashboardAfterConfirm = await fetch(`${baseUrl}/api/organizer/analytics/dashboard`, {
    headers: { Authorization: `Bearer ${org.token}` },
  }).then((r) => r.json());
  assert.equal(dashboardAfterConfirm.confirmedExhibitors, 1, "organizer dashboard KPI must reflect the just-confirmed exhibitor");

  // -------- Organizer -> Visitor: capacity-limited ticket booking --------
  const visitorA = await signupUser(baseUrl, `phase21e-visitor-a-${ts}@example.com`, "Visitor A", "visitor");
  extraUserIds.push(visitorA.userId);
  const visitorB = await signupUser(baseUrl, `phase21e-visitor-b-${ts}@example.com`, "Visitor B", "visitor");
  extraUserIds.push(visitorB.userId);
  const visitorC = await signupUser(baseUrl, `phase21e-visitor-c-${ts}@example.com`, "Visitor C", "visitor");
  extraUserIds.push(visitorC.userId);

  const bookA = await bookTicket(org.firstExhibitionId, ticketTypeId, visitorA.token, `phase21e-visitor-a-${ts}@example.com`);
  assert.equal(bookA.status, 201, JSON.stringify(bookA.body));
  const payA = await mockComplete(baseUrl, visitorA.token, bookA.body.payment.id, "success");
  assert.equal(payA.status, 200, JSON.stringify(payA.body));

  const detailAfterA = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`).then((r) => r.json());
  assert.equal(
    detailAfterA.exhibition.ticketTypes.find((t: { id: string }) => t.id === ticketTypeId).remaining,
    1,
    "public remaining-stock must decrease after a booking"
  );

  const bookB = await bookTicket(org.firstExhibitionId, ticketTypeId, visitorB.token, `phase21e-visitor-b-${ts}@example.com`);
  assert.equal(bookB.status, 201, JSON.stringify(bookB.body));
  const payB = await mockComplete(baseUrl, visitorB.token, bookB.body.payment.id, "success");
  assert.equal(payB.status, 200, JSON.stringify(payB.body));

  const bookC = await bookTicket(org.firstExhibitionId, ticketTypeId, visitorC.token, `phase21e-visitor-c-${ts}@example.com`);
  assert.equal(bookC.status, 409, JSON.stringify(bookC.body), "a sold-out ticket type must reject a third booking");

  const organizerVisitors = await fetch(`${baseUrl}/api/bookings/tickets`, { headers: { Authorization: `Bearer ${org.token}` } }).then((r) => r.json());
  const visitorIdsSeen = organizerVisitors.bookings.map((b: { id: string }) => b.id);
  assert.ok(visitorIdsSeen.includes(bookA.body.booking.id) && visitorIdsSeen.includes(bookB.body.booking.id), "organizer visitor list must show both real bookings");

  // -------- Exhibitor -> Visitor: scanner check-in --------
  await prisma.exhibitionExhibitor.update({ where: { id: ex.participationId }, data: { status: "confirmed" } }); // already confirmed above; re-affirm for clarity of intent
  const lookupA = await lookupTicketAsExhibitor(baseUrl, ex.token, bookA.body.booking.qrCode);
  assert.equal(lookupA.status, 200, JSON.stringify(lookupA.body));
  const checkInA = await checkInAsExhibitor(baseUrl, ex.token, bookA.body.booking.id);
  assert.equal(checkInA.status, 200, JSON.stringify(checkInA.body));
  const duplicateA = await checkInAsExhibitor(baseUrl, ex.token, bookA.body.booking.id);
  assert.equal(duplicateA.status, 409, JSON.stringify(duplicateA.body));

  // -------- Exhibitor -> Lead: capture a lead from the checked-in visitor's ticket --------
  const captureLead = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ex.token}` },
    body: JSON.stringify({ exhibitionExhibitorId: ex.participationId, ticketBookingId: bookA.body.booking.id, source: "qr_scan" }),
  });
  const leadBody = await captureLead.json();
  assert.equal(captureLead.status, 201, JSON.stringify(leadBody));
  assert.equal(leadBody.lead.visitorEmail, `phase21e-visitor-a-${ts}@example.com`, "capturing a lead from a ticket must auto-fill the real visitor's contact details");

  // Exhibitor's own lead list shows it.
  const exhibitorLeads = await fetch(`${baseUrl}/api/leads`, { headers: { Authorization: `Bearer ${ex.token}` } }).then((r) => r.json());
  assert.ok(exhibitorLeads.leads.some((l: { id: string }) => l.id === leadBody.lead.id));

  // Organizer's aggregate lead list (Phase 21C) shows the same lead, with correct exhibition/business context.
  const organizerLeads = await fetch(`${baseUrl}/api/organizer/leads`, { headers: { Authorization: `Bearer ${org.token}` } }).then((r) => r.json());
  const sameLeadFromOrganizer = organizerLeads.leads.find((l: { id: string }) => l.id === leadBody.lead.id);
  assert.ok(sameLeadFromOrganizer, "organizer must see the exhibitor's captured lead in the aggregate list");
  assert.equal(sameLeadFromOrganizer.exhibitionExhibitor.exhibition.id, org.firstExhibitionId);

  const dashboardAfterLead = await fetch(`${baseUrl}/api/organizer/analytics/dashboard`, { headers: { Authorization: `Bearer ${org.token}` } }).then((r) => r.json());
  assert.equal(dashboardAfterLead.totalCheckIns, 1, "dashboard check-in count must reflect the real scan");
  assert.equal(dashboardAfterLead.totalVisitors, 2, "dashboard visitor count must reflect both real paid bookings");
  assert.ok((dashboardAfterLead.totalLeads ?? 0) >= 1, "dashboard lead count must reflect the real captured lead");

  // -------- Refund the visitor ticket: check-in must be blocked, inventory must release --------
  const refundB = await organizerRefund(org.token, bookB.body.payment.id, `phase21e-refund-ticket-${ts}`);
  assert.ok(refundB.refund.id);

  const bookingBAfterRefund = await prisma.ticketBooking.findUniqueOrThrow({ where: { id: bookB.body.booking.id } });
  assert.equal(bookingBAfterRefund.paymentStatus, "refunded");

  const checkInRefundedB = await checkInAsExhibitor(baseUrl, ex.token, bookB.body.booking.id);
  assert.equal(checkInRefundedB.status, 400, JSON.stringify(checkInRefundedB.body), "a refunded ticket must never be checkable-in");

  const detailAfterRefund = await fetch(`${baseUrl}/api/public/exhibitions/${org.firstExhibitionId}`).then((r) => r.json());
  assert.equal(
    detailAfterRefund.exhibition.ticketTypes.find((t: { id: string }) => t.id === ticketTypeId).remaining,
    1,
    "refunding a booking must release its seat back to remaining stock"
  );
  const bookD = await signupUser(baseUrl, `phase21e-visitor-d-${ts}@example.com`, "Visitor D", "visitor");
  extraUserIds.push(bookD.userId);
  const bookingD = await bookTicket(org.firstExhibitionId, ticketTypeId, bookD.token, `phase21e-visitor-d-${ts}@example.com`);
  assert.equal(bookingD.status, 201, JSON.stringify(bookingD.body), "the released seat must be genuinely bookable again");

  // -------- Refund the exhibitor's stall payment: stall must release, participation must cancel --------
  const refundStall = await organizerRefund(org.token, pay.body.payment.id, `phase21e-refund-stall-${ts}`);
  assert.ok(refundStall.refund.id);

  const participationAfterStallRefund = await prisma.exhibitionExhibitor.findUniqueOrThrow({ where: { id: ex.participationId } });
  assert.equal(participationAfterStallRefund.status, "cancelled", "a fully-refunded stall payment must cancel the participation (existing refund architecture)");

  const stallAfterRefund = await prisma.stall.findUniqueOrThrow({ where: { id: stall.body.stall.id } });
  assert.equal(stallAfterRefund.status, "available");
  assert.equal(stallAfterRefund.exhibitionExhibitorId, null, "a refunded stall must be released back to the available pool");

  // Exhibitor's own view must agree with the organizer's view of the cancellation — no stale state.
  const exhibitorViewAfterCancel = await fetch(`${baseUrl}/api/exhibitor/participations`, { headers: { Authorization: `Bearer ${ex.token}` } }).then((r) => r.json());
  assert.equal(exhibitorViewAfterCancel.participations.find((p: { id: string }) => p.id === ex.participationId)?.status, "cancelled");
});
