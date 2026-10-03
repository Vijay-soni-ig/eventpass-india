import { test, expect, type APIRequestContext } from "@playwright/test";

const EXHIBITION_ID = "seed-exhibition-1";
const ORGANIZER_EMAIL = "org1.owner@eventpass.test";
const PASSWORD = "DevPassword123!";
const EXHIBITOR_EMAIL = `e2e-critical-exhibitor-${Date.now()}@example.com`;
const VISITOR_EMAIL = `e2e-critical-visitor-${Date.now()}@example.com`;

type Auth = { token: string; user: { id: string } };

async function login(request: APIRequestContext, email: string, password = PASSWORD): Promise<Auth> {
  const response = await request.post("/api/auth/login", {
    data: { email, password },
  });
  expect(response.ok(), `login failed for ${email}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function signup(request: APIRequestContext, email: string, userType: "exhibitor" | "visitor"): Promise<Auth> {
  const response = await request.post("/api/auth/signup", {
    data: {
      email,
      password: PASSWORD,
      fullName: userType === "exhibitor" ? "E2E Critical Exhibitor" : "E2E Critical Visitor",
      userType,
    },
  });
  expect(response.status(), `signup failed: ${await response.text()}`).toBe(201);
  return response.json();
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe("P0 critical business lifecycle", () => {
  test("Organizer → Exhibitor → Stall → Payment → Visitor → Ticket → QR → Check-in → Lead → Analytics", async ({ request }) => {
    test.setTimeout(120_000);

    // 1. Organizer access / event fixture.
    const organizer = await login(request, ORGANIZER_EMAIL);
    const exhibitionResponse = await request.get(`/api/exhibitions/${EXHIBITION_ID}`, {
      headers: auth(organizer.token),
    });
    expect(exhibitionResponse.ok()).toBeTruthy();
    const exhibitionPayload = await exhibitionResponse.json();
    const exhibition = exhibitionPayload.exhibition;
    expect(exhibition.id).toBe(EXHIBITION_ID);

    // 2. Find an available stall and a purchasable ticket type from the same exhibition.
    const stall = exhibition.stalls.find((item: { status: string }) => item.status === "available");
    expect(stall, "critical-path fixture needs at least one available stall").toBeTruthy();
    const ticketCreateResponse = await request.post(`/api/exhibitions/${EXHIBITION_ID}/tickets`, {
      headers: { ...auth(organizer.token), "Content-Type": "application/json" },
      data: {
        name: `E2E Critical Paid Ticket ${Date.now()}`,
        price: 499,
        quantity: 10,
        taxPercent: 0,
        visible: true,
      },
    });
    expect(ticketCreateResponse.status(), `paid ticket fixture creation failed: ${await ticketCreateResponse.text()}`).toBe(201);
    const ticketType = (await ticketCreateResponse.json()).ticket;
    expect(ticketType.price).toBe(499);

    // 3. Exhibitor signup/application.
    const exhibitor = await signup(request, EXHIBITOR_EMAIL, "exhibitor");
    const applyResponse = await request.post("/api/exhibitor/participations", {
      headers: auth(exhibitor.token),
      data: { exhibitionId: EXHIBITION_ID },
    });
    expect(applyResponse.status(), `exhibitor application failed: ${await applyResponse.text()}`).toBe(201);
    const participation = (await applyResponse.json()).participation;

    // 4. Organizer approves the exhibitor.
    const approveResponse = await request.patch(
      `/api/exhibitions/${EXHIBITION_ID}/exhibitors/${participation.id}`,
      {
        headers: { ...auth(organizer.token), "Content-Type": "application/json" },
        data: { status: "approved" },
      },
    );
    expect(approveResponse.ok(), `exhibitor approval failed: ${await approveResponse.text()}`).toBeTruthy();

    // 5. Exhibitor selects/reserves a stall.
    const reserveStallResponse = await request.post(
      `/api/exhibitor/participations/${participation.id}/stall`,
      {
        headers: { ...auth(exhibitor.token), "Content-Type": "application/json" },
        data: { stallId: stall.id },
      },
    );
    expect(reserveStallResponse.ok(), `stall reservation failed: ${await reserveStallResponse.text()}`).toBeTruthy();
    const reservedParticipation = (await reserveStallResponse.json()).participation;
    expect(reservedParticipation.status).toBe("stall_reserved");

    // 6. Start stall payment, then complete it through the test payment provider.
    const stallPaymentResponse = await request.post(
      `/api/exhibitor/participations/${participation.id}/payment`,
      { headers: auth(exhibitor.token) },
    );
    expect(stallPaymentResponse.status()).toBe(201);
    const stallPayment = await stallPaymentResponse.json();
    expect(stallPayment.payment.status).toBe("created");

    const stallCompleteResponse = await request.post(
      `/api/payments/${stallPayment.payment.id}/mock-complete`,
      {
        headers: { ...auth(exhibitor.token), "Content-Type": "application/json" },
        data: { outcome: "success" },
      },
    );
    expect(stallCompleteResponse.ok(), `stall payment completion failed: ${await stallCompleteResponse.text()}`).toBeTruthy();
    expect((await stallCompleteResponse.json()).payment.status).toBe("paid");

    // Confirm the business state, not just the payment row.
    const participationAfterPayment = await request.get(
      `/api/exhibitor/participations`,
      { headers: auth(exhibitor.token) },
    );
    expect(participationAfterPayment.ok()).toBeTruthy();
    const participationRows = (await participationAfterPayment.json()).participations;
    const confirmed = participationRows.find((item: { id: string }) => item.id === participation.id);
    expect(confirmed?.status).toBe("confirmed");

    // 7. Visitor signup and paid ticket booking.
    const visitor = await signup(request, VISITOR_EMAIL, "visitor");
    const ticketBookingResponse = await request.post("/api/bookings/tickets", {
      headers: { ...auth(visitor.token), "Content-Type": "application/json", "Idempotency-Key": `critical-ticket-${Date.now()}` },
      data: {
        exhibitionId: EXHIBITION_ID,
        ticketTypeId: ticketType.id,
        attendeeName: "E2E Critical Visitor",
        attendeeEmail: VISITOR_EMAIL,
        quantity: 1,
      },
    });
    expect(ticketBookingResponse.status(), `ticket booking failed: ${await ticketBookingResponse.text()}`).toBe(201);
    const ticketBooking = await ticketBookingResponse.json();
    expect(ticketBooking.booking.paymentStatus).toBe("created");

    // 8. Complete visitor payment through the same provider pipeline.
    const ticketCompleteResponse = await request.post(
      `/api/payments/${ticketBooking.payment.id}/mock-complete`,
      {
        headers: { ...auth(visitor.token), "Content-Type": "application/json" },
        data: { outcome: "success" },
      },
    );
    expect(ticketCompleteResponse.ok(), `ticket payment completion failed: ${await ticketCompleteResponse.text()}`).toBeTruthy();
    expect((await ticketCompleteResponse.json()).payment.status).toBe("paid");

    const ticketResponse = await request.get(
      `/api/bookings/tickets/${ticketBooking.booking.id}`,
      { headers: auth(visitor.token) },
    );
    expect(ticketResponse.ok()).toBeTruthy();
    expect((await ticketResponse.json()).booking.paymentStatus).toBe("paid");

    // 9. QR retrieval verifies ownership and the persisted QR code.
    const qrResponse = await request.get(
      `/api/bookings/tickets/${ticketBooking.booking.id}/qr`,
      { headers: auth(visitor.token) },
    );
    expect(qrResponse.ok()).toBeTruthy();
    const qr = await qrResponse.json();
    expect(qr.qrCode).toBeTruthy();
    expect(qr.qrImage).toMatch(/^data:image\\/png;base64,/);

    // 10. Organizer scans/checks in the paid ticket.
    const checkInResponse = await request.patch(
      `/api/bookings/tickets/${ticketBooking.booking.id}/check-in`,
      {
        headers: { ...auth(organizer.token), "Content-Type": "application/json" },
        data: {},
      },
    );
    expect(checkInResponse.ok(), `check-in failed: ${await checkInResponse.text()}`).toBeTruthy();
    expect((await checkInResponse.json()).booking.checkInStatus).toBe(true);

    // Duplicate check-in must remain rejected.
    const duplicateCheckIn = await request.patch(
      `/api/bookings/tickets/${ticketBooking.booking.id}/check-in`,
      {
        headers: { ...auth(organizer.token), "Content-Type": "application/json" },
        data: {},
      },
    );
    expect(duplicateCheckIn.status()).toBe(409);

    // 11. Exhibitor captures the checked-in visitor as a lead.
    const leadResponse = await request.post("/api/leads", {
      headers: { ...auth(exhibitor.token), "Content-Type": "application/json" },
      data: {
        exhibitionExhibitorId: participation.id,
        ticketBookingId: ticketBooking.booking.id,
        source: "qr_scan",
        priority: "high",
        notes: "P0 critical lifecycle lead",
      },
    });
    expect(leadResponse.status(), `lead capture failed: ${await leadResponse.text()}`).toBe(201);
    const lead = (await leadResponse.json()).lead;
    expect(lead.ticketBookingId).toBe(ticketBooking.booking.id);

    // 12. Verify analytics reflect the lead.
    const exhibitorAnalytics = await request.get("/api/leads/analytics", {
      headers: auth(exhibitor.token),
    });
    expect(exhibitorAnalytics.ok(), `exhibitor analytics failed: ${await exhibitorAnalytics.text()}`).toBeTruthy();
    const analytics = await exhibitorAnalytics.json();
    const analyticsText = JSON.stringify(analytics);
    expect(analyticsText).toContain(EXHIBITION_ID);

    const organizerAnalytics = await request.get(
      `/api/organizer/analytics/exhibitions/${EXHIBITION_ID}`,
      { headers: auth(organizer.token) },
    );
    expect(organizerAnalytics.ok(), `organizer analytics failed: ${await organizerAnalytics.text()}`).toBeTruthy();
  });
});
