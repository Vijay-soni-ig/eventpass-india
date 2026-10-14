import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const EXHIBITION_ID = "seed-exhibition-1";
const TICKET_TYPE_ID = "seed-tickettype-general";
const ORGANIZER_EMAIL = "org1.owner@eventpass.test";
const EXHIBITOR_EMAIL = "biz1.staff@eventpass.test";

async function login(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.status(), `login failed for ${email}: ${await response.text()}`).toBe(200);
  const body = await response.json();
  expect(body.token).toBeTruthy();
  return body.token as string;
}

async function jsonOrFail(response: Awaited<ReturnType<APIRequestContext["get"]>>, label: string) {
  expect(response.ok(), `${label} failed: ${await response.text()}`).toBeTruthy();
  return response.json();
}

test.describe("Cross-persona exhibition lifecycle", () => {
  test("visitor ticket → organizer check-in → exhibitor lead → source-backed analytics", async ({ request }) => {
    const runId = randomUUID();
    const visitorName = `Lifecycle Visitor ${runId.slice(0, 8)}`;
    const visitorEmail = `lifecycle-${runId}@example.com`;

    const organizerToken = await login(request, ORGANIZER_EMAIL);
    const exhibitorToken = await login(request, EXHIBITOR_EMAIL);

    // Resolve the exhibitor's confirmed participation from the API instead of
    // hard-coding a participation ID or trusting a client-supplied business ID.
    const participationResponse = await request.get("/api/exhibitor/participations", {
      headers: { Authorization: `Bearer ${exhibitorToken}` },
    });
    const participationPayload = await jsonOrFail(participationResponse, "exhibitor participation list");
    const participation = participationPayload.participations.find(
      (item: { exhibitionId: string; status: string }) =>
        item.exhibitionId === EXHIBITION_ID && item.status === "confirmed",
    );
    expect(participation, "seeded exhibitor must have confirmed participation").toBeTruthy();

    const organizerAnalyticsBefore = await jsonOrFail(
      await request.get(`/api/organizer/analytics/dashboard?exhibitionId=${EXHIBITION_ID}`, {
        headers: { Authorization: `Bearer ${organizerToken}` },
      }),
      "organizer analytics before lifecycle",
    );
    const exhibitorAnalyticsBefore = await jsonOrFail(
      await request.get("/api/leads/analytics", {
        headers: { Authorization: `Bearer ${exhibitorToken}` },
      }),
      "exhibitor lead analytics before lifecycle",
    );

    // Persona 1: visitor purchases a free ticket through the real booking API.
    const visitorSignup = await request.post("/api/auth/signup", {
      data: {
        email: visitorEmail,
        password: PASSWORD,
        fullName: visitorName,
        userType: "visitor",
      },
    });
    expect(visitorSignup.status(), `visitor signup failed: ${await visitorSignup.text()}`).toBe(201);
    const visitor = await visitorSignup.json();
    const visitorHeaders = { Authorization: `Bearer ${visitor.token}` };

    const bookingResponse = await request.post("/api/bookings/tickets", {
      headers: { ...visitorHeaders, "Idempotency-Key": `cross-persona-${runId}` },
      data: {
        exhibitionId: EXHIBITION_ID,
        ticketTypeId: TICKET_TYPE_ID,
        attendeeName: visitorName,
        attendeeEmail: visitorEmail,
        quantity: 1,
      },
    });
    expect(bookingResponse.status(), `visitor ticket booking failed: ${await bookingResponse.text()}`).toBe(201);
    const bookingPayload = await bookingResponse.json();
    const booking = bookingPayload.booking as {
      id: string;
      exhibitionId: string;
      paymentStatus: string;
      checkInStatus: boolean;
      attendeeEmail: string;
    };
    expect(booking.exhibitionId).toBe(EXHIBITION_ID);
    expect(booking.paymentStatus).toBe("paid");
    expect(booking.checkInStatus).toBe(false);
    expect(booking.attendeeEmail).toBe(visitorEmail);

    // Resolve the QR through the visitor-owned QR endpoint and organizer scanner
    // lookup before check-in; the scanner must resolve the same source booking.
    const qrResponse = await request.get(`/api/bookings/tickets/${booking.id}/qr`, {
      headers: visitorHeaders,
    });
    expect(qrResponse.status(), `visitor QR retrieval failed: ${await qrResponse.text()}`).toBe(200);
    const qrPayload = await qrResponse.json();
    expect(qrPayload.qrCode).toBeTruthy();

    const lookupResponse = await request.get(
      `/api/bookings/tickets/lookup/${encodeURIComponent(qrPayload.qrCode)}`,
      { headers: { Authorization: `Bearer ${organizerToken}` } },
    );
    expect(lookupResponse.status(), `organizer QR lookup failed: ${await lookupResponse.text()}`).toBe(200);
    const lookupPayload = await lookupResponse.json();
    expect(lookupPayload.booking.id).toBe(booking.id);

    // Persona 2: the organizer checks in that exact QR-resolved booking. This
    // verifies the server-side paid-ticket and tenant-ownership boundary.
    const checkInResponse = await request.patch(`/api/bookings/tickets/${booking.id}/check-in`, {
      headers: { Authorization: `Bearer ${organizerToken}` },
      data: {},
    });
    expect(checkInResponse.status(), `organizer check-in failed: ${await checkInResponse.text()}`).toBe(200);
    const checkInPayload = await checkInResponse.json();
    expect(checkInPayload.booking.id).toBe(booking.id);
    expect(checkInPayload.booking.checkInStatus).toBe(true);
    expect(checkInPayload.checkIn.ticketBookingId).toBe(booking.id);

    // Persona 3: the confirmed exhibitor captures the checked-in visitor as a lead.
    const leadResponse = await request.post("/api/leads", {
      headers: { Authorization: `Bearer ${exhibitorToken}` },
      data: {
        exhibitionExhibitorId: participation.id,
        ticketBookingId: booking.id,
        source: "qr_scan",
        notes: "Cross-persona lifecycle E2E regression",
      },
    });
    expect(leadResponse.status(), `exhibitor lead capture failed: ${await leadResponse.text()}`).toBe(201);
    const leadPayload = await leadResponse.json();
    expect(leadPayload.lead.ticketBookingId).toBe(booking.id);
    expect(leadPayload.lead.visitorName).toBe(visitorName);
    expect(leadPayload.lead.visitorEmail).toBe(visitorEmail);
    expect(leadPayload.lead.exhibitionExhibitorId).toBe(participation.id);

    // Confirm the lead is queryable through the authorized exhibitor API.
    const leadsPayload = await jsonOrFail(
      await request.get(`/api/leads?exhibitionId=${EXHIBITION_ID}`, {
        headers: { Authorization: `Bearer ${exhibitorToken}` },
      }),
      "exhibitor lead list after capture",
    );
    expect(leadsPayload.leads.some((lead: { id: string; ticketBookingId: string }) =>
      lead.id === leadPayload.lead.id && lead.ticketBookingId === booking.id,
    )).toBe(true);

    // Analytics must reconcile to source records. Use monotonic deltas because
    // other E2E workers may add independent fixture rows in parallel.
    const organizerAnalyticsAfter = await jsonOrFail(
      await request.get(`/api/organizer/analytics/dashboard?exhibitionId=${EXHIBITION_ID}`, {
        headers: { Authorization: `Bearer ${organizerToken}` },
      }),
      "organizer analytics after lifecycle",
    );
    expect(organizerAnalyticsAfter.totalVisitors).toBeGreaterThanOrEqual(organizerAnalyticsBefore.totalVisitors + 1);
    expect(organizerAnalyticsAfter.totalCheckIns).toBeGreaterThanOrEqual(organizerAnalyticsBefore.totalCheckIns + 1);
    expect(organizerAnalyticsAfter.totalLeads).toBeGreaterThanOrEqual(organizerAnalyticsBefore.totalLeads + 1);

    const exhibitorAnalyticsAfter = await jsonOrFail(
      await request.get("/api/leads/analytics", {
        headers: { Authorization: `Bearer ${exhibitorToken}` },
      }),
      "exhibitor lead analytics after lifecycle",
    );
    expect(exhibitorAnalyticsAfter.totalLeads).toBeGreaterThanOrEqual(exhibitorAnalyticsBefore.totalLeads + 1);
    expect(exhibitorAnalyticsAfter.visitorsInteractedWith).toBeGreaterThanOrEqual(
      exhibitorAnalyticsBefore.visitorsInteractedWith + 1,
    );
  });
});
