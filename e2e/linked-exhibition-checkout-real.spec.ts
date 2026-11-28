import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const EXHIBITION_ID = "a9310000-0000-4000-8000-000000000002";
const LEGACY_TICKET_TYPE_ID = "a9310000-0000-4000-8000-000000000003";
const ORGANIZER_EMAIL = "org1.owner@eventpass.test";
const SCANNER_EMAIL = "org1.admin@eventpass.test";

async function login(request: APIRequestContext, email: string) {
  const response = await request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.status(), `login failed for ${email}: ${await response.text()}`).toBe(200);
  const body = await response.json();
  expect(body.token).toBeTruthy();
  return body.token as string;
}

async function jsonOrFail(response: APIResponse, label: string) {
  expect(response.ok(), `${label} failed: ${await response.text()}`).toBeTruthy();
  return response.json();
}

test("real linked Exhibition purchase → Event ticket → organizer check-in → reconciled analytics", async ({ page, request }) => {
  test.setTimeout(120_000);
  const runId = randomUUID();
  const visitorName = `Linked Checkout Visitor ${runId.slice(0, 8)}`;
  const visitorEmail = `linked-checkout-${runId}@example.com`;

  // Organizer publishes the linked Exhibition through the real owner-scoped API.
  const organizerToken = await login(request, ORGANIZER_EMAIL);
  const organizerHeaders = { Authorization: `Bearer ${organizerToken}` };
  const scannerToken = await login(request, SCANNER_EMAIL);
  const scannerHeaders = { Authorization: `Bearer ${scannerToken}` };
  const draftResponse = await request.get(`/api/exhibitions/${EXHIBITION_ID}`, { headers: organizerHeaders });
  const draftPayload = await jsonOrFail(draftResponse, "linked Exhibition draft");
  const draft = draftPayload.exhibition as { id: string; eventId: string; status: string };
  expect(draft.status).toBe("draft");
  expect(draft.eventId).toBeTruthy();

  const publishResponse = await request.put(`/api/exhibitions/${EXHIBITION_ID}`, {
    headers: organizerHeaders,
    data: { status: "live" },
  });
  expect(publishResponse.status(), `linked Exhibition publish failed: ${await publishResponse.text()}`).toBe(200);
  const publishedPayload = await publishResponse.json();
  expect(publishedPayload.exhibition.status).toBe("live");

  const publicExhibitionPayload = await jsonOrFail(
    await request.get(`/api/public/exhibitions/${EXHIBITION_ID}`),
    "published linked Exhibition",
  );
  const exhibition = publicExhibitionPayload.exhibition as {
    id: string;
    name: string;
    eventId: string;
    startDate: string;
    ticketTypes: Array<{ id: string; name: string; eventTicketTypeId: string | null }>;
    linkedEventCheckoutEnabled: boolean;
  };
  const eventId = exhibition.eventId;
  expect(exhibition.linkedEventCheckoutEnabled).toBe(true);
  const legacyTicket = exhibition.ticketTypes.find((ticket) => ticket.id === LEGACY_TICKET_TYPE_ID);
  expect(legacyTicket?.eventTicketTypeId).toBeTruthy();

  const eventCatalog = await jsonOrFail(
    await request.get(`/api/public/events/${eventId}/tickets`),
    "canonical linked Event ticket catalog",
  );
  expect(eventCatalog.linkedEventCheckoutEnabled).toBe(true);
  expect(eventCatalog.ticketTypes.some((ticket: { id: string; eventTicketTypeId?: string }) =>
    ticket.id === LEGACY_TICKET_TYPE_ID && ticket.eventTicketTypeId === legacyTicket?.eventTicketTypeId,
  )).toBe(true);

  const analyticsBefore = await jsonOrFail(
    await request.get(`/api/organizer/event-analytics/${eventId}`, { headers: scannerHeaders }),
    "organizer analytics before purchase",
  );

  const visitorSignup = await request.post("/api/auth/signup", {
    data: { email: visitorEmail, password: PASSWORD, fullName: visitorName, userType: "visitor" },
  });
  expect(visitorSignup.status(), `visitor signup failed: ${await visitorSignup.text()}`).toBe(201);
  const visitor = await visitorSignup.json();
  const visitorHeaders = { Authorization: `Bearer ${visitor.token as string}` };

  // The browser must enter through the legacy Exhibition public URL and be
  // routed to the canonical Event checkout without creating TicketBooking rows.
  await page.goto(`/exhibition/${EXHIBITION_ID}`);
  const ticketOption = page.getByRole("radio", { name: /E2E Linked Visitor Pass/ });
  await expect(ticketOption).toBeVisible();
  await ticketOption.click();
  await page.getByRole("button", { name: "Continue to Book" }).click();
  await expect(page).toHaveURL(new RegExp(`/event/${eventId}/tickets\\?ticket=${LEGACY_TICKET_TYPE_ID}`));

  const visitDate = new Date(exhibition.startDate).toISOString().slice(0, 10);
  await page.locator("#visit-date").fill(visitDate);
  const continueToAuth = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueToAuth).toBeEnabled();
  await continueToAuth.click();
  await expect(page).toHaveURL(/\/auth\?redirect=/);

  // Sign in through the actual browser form; the selected ticket and visit date
  // must survive the authentication round-trip.
  await page.locator("#login-email").fill(visitorEmail);
  await page.locator("#login-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/event/${eventId}/tickets`));
  await expect(page.locator("#visit-date")).toHaveValue(visitDate);
  const continueToDetails = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueToDetails).toBeEnabled();
  await continueToDetails.click();

  await page.locator("#attendee-name").fill(visitorName);
  await page.locator("#attendee-email").fill(visitorEmail);
  const continueToPayment = page.getByRole("button", { name: "Continue to payment" });
  await expect(continueToPayment).toBeEnabled();
  await continueToPayment.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Test Payment Gateway")).toBeVisible();
  await page.getByRole("button", { name: "Simulate Success" }).click();
  await expect(page.getByText("Ticket confirmed")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("link", { name: "Go to My Tickets" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await expect(page.getByText("E2E Linked Checkout Event 2026")).toBeVisible();
  await expect(page.getByText("E2E Linked Visitor Pass")).toBeVisible();

  const ticketsPayload = await jsonOrFail(
    await request.get("/api/event-tickets/mine", { headers: visitorHeaders }),
    "visitor Universal Event tickets",
  );
  const ticket = ticketsPayload.tickets.find((item: { eventId: string; status: string }) =>
    item.eventId === eventId && item.status === "ACTIVE",
  );
  expect(ticket).toBeTruthy();
  expect(ticket.ticketTypeId).toBe(legacyTicket?.eventTicketTypeId);
  expect(String(ticket.visitDate).slice(0, 10)).toBe(visitDate);

  const ordersPayload = await jsonOrFail(
    await request.get("/api/event-ticket-orders/mine", { headers: visitorHeaders }),
    "visitor Universal Event orders",
  );
  const paidOrder = ordersPayload.orders.find((order: { eventId: string; status: string }) =>
    order.eventId === eventId && order.status === "PAID",
  );
  expect(paidOrder).toBeTruthy();
  expect(paidOrder.reservation.eventId).toBe(eventId);
  expect(paidOrder.reservation.eventTicketTypeId).toBe(legacyTicket?.eventTicketTypeId);
  expect(String(paidOrder.reservation.visitDate).slice(0, 10)).toBe(visitDate);
  expect(paidOrder.payment.status).toBe("paid");
  expect(paidOrder.payment.provider).toBe("mock");

  const legacyBookingsPayload = await jsonOrFail(
    await request.get("/api/bookings/tickets/mine", { headers: visitorHeaders }),
    "legacy booking compatibility check",
  );
  expect(legacyBookingsPayload.bookings).toHaveLength(0);

  // The visitor-owned Event QR is resolved by the organizer scanner, then the
  // source-backed Event analytics must reflect the same paid/check-in record.
  const qrPayload = await jsonOrFail(
    await request.get(`/api/event-tickets/${ticket.id}/qr`, { headers: visitorHeaders }),
    "visitor Event ticket QR",
  );
  const checkInResponse = await request.post("/api/event-ticket-check-ins", {
    headers: scannerHeaders,
    data: { qrPayload: qrPayload.payload, eventId },
  });
  expect(checkInResponse.status(), `organizer check-in failed: ${await checkInResponse.text()}`).toBe(200);
  const checkInPayload = await checkInResponse.json();
  expect(checkInPayload.ticket.id).toBe(ticket.id);
  expect(checkInPayload.ticket.status).toBe("USED");

  const analyticsAfter = await jsonOrFail(
    await request.get(`/api/organizer/event-analytics/${eventId}`, { headers: organizerHeaders }),
    "organizer analytics after purchase and check-in",
  );
  expect(analyticsAfter.tickets.total).toBeGreaterThanOrEqual(analyticsBefore.tickets.total + 1);
  expect(analyticsAfter.tickets.used).toBeGreaterThanOrEqual(analyticsBefore.tickets.used + 1);
  expect(analyticsAfter.checkIns.total).toBeGreaterThanOrEqual(analyticsBefore.checkIns.total + 1);
  expect(analyticsAfter.orders.paid).toBeGreaterThanOrEqual(analyticsBefore.orders.paid + 1);

  // Old /book/:id links remain compatible but cannot create a parallel legacy
  // purchase after the linked Event cutover is enabled.
  await page.goto(`/book/${EXHIBITION_ID}?ticket=${LEGACY_TICKET_TYPE_ID}&quantity=1&remaining=99&visitDate=${visitDate}`);
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/event/${eventId}/tickets`);
  const redirectedUrl = new URL(page.url());
  expect(redirectedUrl.searchParams.get("ticket")).toBe(LEGACY_TICKET_TYPE_ID);
  expect(redirectedUrl.searchParams.get("visitDate")).toBe(visitDate);
  expect(redirectedUrl.searchParams.has("remaining")).toBe(false);

  const legacyBookingsAfterRedirect = await jsonOrFail(
    await request.get("/api/bookings/tickets/mine", { headers: visitorHeaders }),
    "legacy booking compatibility after direct-link redirect",
  );
  expect(legacyBookingsAfterRedirect.bookings).toHaveLength(0);
});
