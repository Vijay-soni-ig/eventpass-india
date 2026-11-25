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

  test("standalone Universal Event: organizer publishes → exhibitor applies/approval → visitor ticket/check-in → lead capture/CRM/analytics", async ({ request, page }) => {
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
        modules: ["TICKETING", "CHECK_IN", "ANALYTICS", "EXHIBITORS", "LEADS"],
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
      .toEqual(["ANALYTICS", "CHECK_IN", "EXHIBITORS", "LEADS", "TICKETING"]);

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

      // Persona 2: an exhibitor applies to this standalone Event and the organizer approves
      // the exact business participation before it can capture checked-in visitors.
      const exhibitorToken = await login(request, "biz1.owner@eventpass.test");
      const exhibitorHeaders = { Authorization: `Bearer ${exhibitorToken}` };
      const applicationResponse = await request.post("/api/event-exhibitor-participations", {
        headers: { ...exhibitorHeaders, "X-Exhibitor-Business-Id": "seed-exhibitor-biz-1" },
        data: { eventId: created.id, applicationNote: "Applying to the standalone lifecycle E2E event." },
      });
      expect(applicationResponse.status(), `exhibitor application failed: ${await applicationResponse.text()}`).toBe(201);
      const applicationBody = await applicationResponse.json();
      const participation = applicationBody.participation as {
        id: string;
        eventId: string;
        exhibitorBusinessId: string;
        status: string;
      };
      expect(participation.eventId).toBe(created.id);
      expect(participation.status).toBe("APPLIED");

      const reviewResponse = await request.patch(
        `/api/event-exhibitor-participations/events/${created.id}/${participation.id}/review`,
        {
          headers: organizerHeaders,
          data: { status: "CONFIRMED", reviewNote: "Approved for the standalone Event lifecycle." },
        },
      );
      expect(reviewResponse.status(), `organizer approval failed: ${await reviewResponse.text()}`).toBe(200);
      expect((await reviewResponse.json()).participation.status).toBe("CONFIRMED");

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

      // Confirm the approved exhibitor receives the exact Event/business capture context.
      const contextsResponse = await request.get("/api/event-leads/capture-contexts", {
        headers: exhibitorHeaders,
      });
      expect(contextsResponse.ok(), await contextsResponse.text()).toBeTruthy();
      const contextsPayload = await contextsResponse.json();
      const selectedContext = contextsPayload.contexts.find((context: {
        eventId: string;
        exhibitorBusinessId: string;
        eventExhibitorParticipationId: string | null;
      }) => context.eventId === created.id
        && context.exhibitorBusinessId === participation.exhibitorBusinessId
        && context.eventExhibitorParticipationId === participation.id);
      expect(selectedContext, "approved exhibitor must receive its Event-native lead capture context").toBeTruthy();

      // Persona 4: the exhibitor captures the visitor only after the organizer's
      // successful check-in. Exercise the actual capture UI, not only the API.
      await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), exhibitorToken);
      await page.goto("/exhibitor-dashboard/leads/capture");
      await expect(page.getByRole("heading", { name: "Capture Visitor Lead" })).toBeVisible();
      await page.getByRole("combobox", { name: "Event / Exhibition" }).click();
      await page.getByText(title, { exact: false }).click();
      await page.getByRole("tab", { name: "Manual" }).click();
      await page.getByPlaceholder("Paste the ticket QR payload").fill(qr.payload);
      const captureResponses: string[] = [];
      page.on("response", async (response) => {
        if (response.url().includes("/api/event-leads/") && response.request().method() === "POST") {
          let body = "";
          try { body = await response.text(); } catch { body = "<unreadable>"; }
          captureResponses.push(`${response.status()} ${response.url()} ${body}`);
        }
      });
      await page.getByRole("button", { name: "Capture Lead" }).click();
      await expect(page.getByText("Lead Captured", { exact: true })).toBeVisible({ timeout: 15000 }).catch(() => {
        throw new Error(`Standalone Event lead capture failed. Responses: ${captureResponses.join(" | ")}`);
      });

      // Repeating the same capture must be idempotent and must not create a second CRM row.
      await page.getByPlaceholder("Paste the ticket QR payload").fill(qr.payload);
      await page.getByRole("button", { name: "Capture Lead" }).click();
      await expect(page.getByText("Lead Already Captured", { exact: true })).toBeVisible({ timeout: 15000 });

      const exhibitorLeadsResponse = await request.get(
        `/api/event-leads?eventId=${created.id}&exhibitorBusinessId=${participation.exhibitorBusinessId}`,
        { headers: exhibitorHeaders },
      );
      expect(exhibitorLeadsResponse.ok(), await exhibitorLeadsResponse.text()).toBeTruthy();
      const exhibitorLeads = await exhibitorLeadsResponse.json();
      expect(exhibitorLeads.pagination.total).toBe(1);
      const capturedLead = exhibitorLeads.leads[0];
      expect(capturedLead.eventExhibitorParticipationId).toBe(participation.id);
      expect(capturedLead.ticketId).toBe(ticket.id);
      expect(capturedLead.visitorName).toBe(`Universal Visitor ${runId.slice(0, 8)}`);

      // Organizer and exhibitor must see the same Event-native CRM record within their scopes.
      const organizerLeadsResponse = await request.get(`/api/event-leads?eventId=${created.id}`, {
        headers: organizerHeaders,
      });
      expect(organizerLeadsResponse.ok(), await organizerLeadsResponse.text()).toBeTruthy();
      const organizerLeads = await organizerLeadsResponse.json();
      expect(organizerLeads.pagination.total).toBe(1);
      expect(organizerLeads.leads[0].id).toBe(capturedLead.id);

      const updateLeadResponse = await request.patch(`/api/event-leads/${capturedLead.id}`, {
        headers: exhibitorHeaders,
        data: { status: "CONTACTED", priority: "HIGH", notes: "Follow-up initiated from the standalone Event E2E." },
      });
      expect(updateLeadResponse.status(), `CRM update failed: ${await updateLeadResponse.text()}`).toBe(200);
      expect((await updateLeadResponse.json()).lead.status).toBe("CONTACTED");

      const leadAnalyticsResponse = await request.get(
        `/api/event-leads/analytics?exhibitorBusinessId=${participation.exhibitorBusinessId}`,
        { headers: exhibitorHeaders },
      );
      expect(leadAnalyticsResponse.ok(), await leadAnalyticsResponse.text()).toBeTruthy();
      const leadAnalytics = await leadAnalyticsResponse.json();
      expect(leadAnalytics.totalLeads).toBe(1);
      expect(leadAnalytics.contactedLeads).toBe(1);
      expect(leadAnalytics.visitorsInteractedWith).toBe(0);

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
