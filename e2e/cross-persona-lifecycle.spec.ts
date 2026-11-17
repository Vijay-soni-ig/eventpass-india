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

    const organizerToken = await login(request, "org1.admin@eventpass.test");
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

  test("standalone Universal Event: organizer publishes → visitor ticket → QR check-in → analytics reconcile", async ({ request }) => {
    test.setTimeout(120_000);
    const runId = randomUUID();
    const title = `Universal Lifecycle ${runId.slice(0, 8)}`;
    const organizerToken = await login(request, ORGANIZER_EMAIL);
    const organizerHeaders = { Authorization: `Bearer ${organizerToken}` };

    const createResponse = await request.post("/api/events", {
      headers: organizerHeaders,
      data: {
        eventType: "CONFERENCE",
        title,
        status: "DRAFT",
        visibility: "private",
        startDate: "2027-06-01",
        endDate: "2027-06-02",
        venue: "ExhibitTix E2E Convention Centre",
        city: "Ahmedabad",
        modules: ["TICKETING", "CHECK_IN", "ANALYTICS"],
      },
    });
    expect(createResponse.status(), `standalone Event creation failed: ${await createResponse.text()}`).toBe(201);
    const created = (await createResponse.json()).event as {
      id: string;
      status: string;
      moduleEnablements: Array<{ moduleType: string; enabled: boolean }>;
    };
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("DRAFT");
    expect(created.moduleEnablements.filter((module) => module.enabled).map((module) => module.moduleType).sort())
      .toEqual(["ANALYTICS", "CHECK_IN", "TICKETING"]);

    try {
      const visitorEmail = `universal-lifecycle-${runId}@example.com`;
      const visitorSignup = await request.post("/api/auth/signup", {
        data: {
          email: visitorEmail,
          password: PASSWORD,
          fullName: `Universal Visitor ${runId.slice(0, 8)}`,
          userType: "visitor",
        },
      });
      expect(visitorSignup.status(), `visitor signup failed: ${await visitorSignup.text()}`).toBe(201);
      const visitor = await visitorSignup.json();
      const visitorHeaders = { Authorization: `Bearer ${visitor.token}` };
      const deniedAnalytics = await request.get(`/api/organizer/event-analytics/${created.id}`, {
        headers: visitorHeaders,
      });
      expect(deniedAnalytics.status()).toBe(403);

      const publishResponse = await request.post(`/api/events/${created.id}/publish`, {
        headers: organizerHeaders,
      });
      expect(publishResponse.status(), `Event publish failed: ${await publishResponse.text()}`).toBe(200);
      const published = (await publishResponse.json()).event;
      expect(published.status).toBe("PUBLISHED");
      expect(published.visibility).toBe("public");

      const ticketTypeResponse = await request.post("/api/organizer/event-tickets", {
        headers: organizerHeaders,
        data: {
          eventId: created.id,
          name: `General ${runId.slice(0, 8)}`,
          price: 0,
          currency: "INR",
          capacity: 5,
          maxPerOrder: 2,
          status: "ACTIVE",
        },
      });
      expect(ticketTypeResponse.status(), `ticket type creation failed: ${await ticketTypeResponse.text()}`).toBe(201);
      const ticketType = (await ticketTypeResponse.json()).ticket as { id: string };

      const publicTicketTypes = await request.get(`/api/public/events/${created.id}/tickets`);
      expect(publicTicketTypes.ok(), await publicTicketTypes.text()).toBeTruthy();
      const publicTicketPayload = await publicTicketTypes.json();
      expect(publicTicketPayload.ticketTypes.some((item: { id: string }) => item.id === ticketType.id)).toBe(true);

      const reservationResponse = await request.post("/api/event-ticket-reservations", {
        headers: { ...visitorHeaders, "Idempotency-Key": `universal-reservation-${runId}` },
        data: {
          eventTicketTypeId: ticketType.id,
          attendeeName: `Universal Visitor ${runId.slice(0, 8)}`,
          attendeeEmail: visitorEmail,
          quantity: 1,
        },
      });
      expect(reservationResponse.status(), `ticket reservation failed: ${await reservationResponse.text()}`).toBe(201);
      const reservation = (await reservationResponse.json()).reservation as { id: string };

      const orderResponse = await request.post("/api/event-ticket-orders", {
        headers: visitorHeaders,
        data: { reservationId: reservation.id },
      });
      expect(orderResponse.status(), `ticket order failed: ${await orderResponse.text()}`).toBe(201);
      const orderPayload = await orderResponse.json();
      expect(orderPayload.order.status).toBe("PAID");
      expect(orderPayload.payment.status).toBe("paid");

      const mineResponse = await request.get("/api/event-tickets/mine", { headers: visitorHeaders });
      expect(mineResponse.ok(), await mineResponse.text()).toBeTruthy();
      const minePayload = await mineResponse.json();
      const ticket = minePayload.tickets.find((item: { eventId: string }) => item.eventId === created.id);
      expect(ticket, "visitor must receive a ticket for the newly created standalone Event").toBeTruthy();

      const qrResponse = await request.get(`/api/event-tickets/${ticket.id}/qr`, { headers: visitorHeaders });
      expect(qrResponse.ok(), await qrResponse.text()).toBeTruthy();
      const qr = await qrResponse.json();
      expect(qr.payload).toBeTruthy();

      const checkInResponse = await request.post("/api/event-ticket-check-ins", {
        headers: organizerHeaders,
        data: { qrPayload: qr.payload, eventId: created.id },
      });
      expect(checkInResponse.status(), `organizer check-in failed: ${await checkInResponse.text()}`).toBe(200);
      const checkedIn = await checkInResponse.json();
      expect(checkedIn.ticket.id).toBe(ticket.id);
      expect(checkedIn.ticket.status).toBe("USED");

      const duplicateCheckIn = await request.post("/api/event-ticket-check-ins", {
        headers: organizerHeaders,
        data: { qrPayload: qr.payload, eventId: created.id },
      });
      expect(duplicateCheckIn.status()).toBe(409);

      const analyticsResponse = await request.get(`/api/organizer/event-analytics/${created.id}`, {
        headers: organizerHeaders,
      });
      expect(analyticsResponse.ok(), await analyticsResponse.text()).toBeTruthy();
      const analytics = await analyticsResponse.json();
      expect(analytics.event.id).toBe(created.id);
      expect(analytics.tickets.total).toBe(1);
      expect(analytics.tickets.used).toBe(1);
      expect(analytics.checkIns.total).toBe(1);
      expect(analytics.orders.paid).toBe(1);
      expect(Number(analytics.orders.grossPaid)).toBe(0);
      expect(Number(analytics.orders.netTicketRevenue)).toBe(0);
    } finally {
      await request.delete(`/api/events/${created.id}`, { headers: organizerHeaders }).catch(() => undefined);
    }
  });
});
