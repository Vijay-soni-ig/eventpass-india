import { test, expect } from "@playwright/test";

const EVENT_ID = "e2e-public-event-001";
const EVENT_TITLE = "E2E Public Conference 2026";
const PASSWORD = "DevPassword123!";

test.describe("My Tickets", () => {
  test("unauthenticated visitor can sign up from a protected ticket route and keep that destination", async ({ page }) => {
    await page.goto("/my-tickets");
    await expect(page).toHaveURL(/\/auth\?redirect=%2Fmy-tickets$/);
    await expect(page.getByRole("heading", { name: "Welcome to ExhibitTix" })).toBeVisible();

    await page.getByRole("tab", { name: "Sign Up" }).click();
    await page.getByLabel("Full Name").fill("E2E Protected Route Visitor");
    await page.locator("#signup-email").fill(`e2e-protected-route-${Date.now()}@example.com`);
    await page.locator("#signup-password").fill(PASSWORD);
    await page.locator("#signup-confirm-password").fill(PASSWORD);
    await expect(page.getByRole("radio", { name: "Visitor" })).toBeChecked();
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/my-tickets(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { name: "Event Tickets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toHaveCount(0);

    // A valid client session must survive a full page reload and resolve through /api/auth/me.
    await page.reload();
    await expect(page).toHaveURL(/\/my-tickets(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { name: "Event Tickets" })).toBeVisible();
  });

  test("event-ticket API failures are visible and recoverable", async ({ page, request }) => {
    const email = `e2e-my-tickets-retry-${Date.now()}@example.com`;
    const signup = await request.post("/api/auth/signup", {
      data: { email, password: PASSWORD, fullName: "E2E Ticket Retry Visitor", userType: "visitor" },
    });
    expect(signup.status(), await signup.text()).toBe(201);
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    let ticketListRequests = 0;
    let allowTicketListRecovery = false;
    await page.route("**/api/event-tickets/mine**", async (route) => {
      ticketListRequests += 1;
      // Keep returning 503 through React Query's automatic retries. Only allow success
      // after the test has confirmed the visible error state and is ready to use manual retry.
      if (!allowTicketListRecovery) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary ticket service failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/my-tickets");
    await expect.poll(() => ticketListRequests, { message: "My Tickets should request the universal event-ticket API" }).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "Couldn’t load your event tickets" })).toBeVisible({ timeout: 15_000 });
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    const failedRequests = ticketListRequests;
    allowTicketListRecovery = true;
    await retry.click();
    await expect(page.getByRole("heading", { name: "Couldn’t load your event tickets" })).toHaveCount(0);
    await expect.poll(() => ticketListRequests).toBe(failedRequests + 1);
  });

  test("a visitor cannot access another visitor's ticket details or QR code", async ({ request }) => {
    const suffix = Date.now();
    const ownerEmail = `e2e-ticket-owner-${suffix}@example.com`;
    const otherEmail = `e2e-ticket-other-${suffix}@example.com`;

    const ownerSignup = await request.post("/api/auth/signup", {
      data: { email: ownerEmail, password: PASSWORD, fullName: "E2E Ticket Owner", userType: "visitor" },
    });
    expect(ownerSignup.status(), await ownerSignup.text()).toBe(201);
    const ownerToken = (await ownerSignup.json()).token as string;
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };

    const otherSignup = await request.post("/api/auth/signup", {
      data: { email: otherEmail, password: PASSWORD, fullName: "E2E Other Visitor", userType: "visitor" },
    });
    expect(otherSignup.status(), await otherSignup.text()).toBe(201);
    const otherToken = (await otherSignup.json()).token as string;
    const otherHeaders = { Authorization: `Bearer ${otherToken}` };

    const typesResponse = await request.get(`/api/public/events/${EVENT_ID}/tickets`);
    expect(typesResponse.ok(), await typesResponse.text()).toBeTruthy();
    const types = await typesResponse.json();
    expect(types.ticketTypes.length).toBeGreaterThan(0);

    const reservation = await request.post("/api/event-ticket-reservations", {
      headers: ownerHeaders,
      data: {
        eventTicketTypeId: types.ticketTypes[0].id,
        attendeeName: "E2E Ticket Owner",
        attendeeEmail: ownerEmail,
        quantity: 1,
      },
    });
    expect(reservation.status(), await reservation.text()).toBe(201);
    const { reservation: held } = await reservation.json();

    const order = await request.post("/api/event-ticket-orders", {
      headers: ownerHeaders,
      data: { reservationId: held.id },
    });
    expect(order.status(), await order.text()).toBe(201);

    const ownTickets = await request.get("/api/event-tickets/mine", { headers: ownerHeaders });
    expect(ownTickets.ok(), await ownTickets.text()).toBeTruthy();
    const ownPayload = await ownTickets.json();
    const ticket = ownPayload.tickets.find((item: { attendeeEmail: string }) => item.attendeeEmail === ownerEmail);
    expect(ticket, "the owner should see the ticket issued from their own order").toBeTruthy();

    const otherList = await request.get("/api/event-tickets/mine", { headers: otherHeaders });
    expect(otherList.ok(), await otherList.text()).toBeTruthy();
    const otherPayload = await otherList.json();
    expect(otherPayload.tickets.some((item: { id: string }) => item.id === ticket.id)).toBeFalsy();

    const otherDetail = await request.get(`/api/event-tickets/${ticket.id}`, { headers: otherHeaders });
    expect(otherDetail.status(), await otherDetail.text()).toBe(404);
    expect((await otherDetail.json()).error).toBe("Ticket not found");

    const otherQr = await request.get(`/api/event-tickets/${ticket.id}/qr`, { headers: otherHeaders });
    expect(otherQr.status(), await otherQr.text()).toBe(404);
    expect((await otherQr.json()).error).toBe("Ticket not found");
  });

  test("a visitor finds a ticket bought through the universal event checkout", async ({ page, request }) => {
    // A visitor with one free ticket for the seeded event, made through the same API the checkout uses.
    const email = `e2e-my-tickets-${Date.now()}@example.com`;
    const signup = await request.post("/api/auth/signup", { data: { email, password: PASSWORD, fullName: "E2E My Tickets Visitor", userType: "visitor" } });
    expect(signup.status(), `signup failed: ${await signup.text()}`).toBe(201);
    const { token } = await signup.json();
    const headers = { Authorization: `Bearer ${token}` };

    const types = await (await request.get(`/api/public/events/${EVENT_ID}/tickets`)).json();
    const reservation = await request.post("/api/event-ticket-reservations", {
      headers,
      data: { eventTicketTypeId: types.ticketTypes[0].id, attendeeName: "E2E My Tickets Visitor", attendeeEmail: email, quantity: 1 },
    });
    expect(reservation.status(), `reservation failed: ${await reservation.text()}`).toBe(201);
    const { reservation: held } = await reservation.json();
    const order = await request.post("/api/event-ticket-orders", { headers, data: { reservationId: held.id } });
    expect(order.status(), `order failed: ${await order.text()}`).toBe(201);

    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
    await page.goto("/my-tickets");

    await expect(page.getByRole("heading", { name: "Event Tickets" })).toBeVisible();
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();
    // This visitor has no exhibition bookings, and the page must not claim they have no tickets at all.
    await expect(page.getByText("No exhibition bookings yet")).toBeVisible();
    await expect(page.getByText("No tickets yet")).toHaveCount(0);

    const view = page.getByRole("link", { name: "View Ticket" });
    await expect(view).toHaveAttribute("href", /\/my-tickets\/event\/.+/);
    let qrRequests = 0;
    await page.route(/\/api\/event-tickets\/[^/]+\/qr$/, async (route) => {
      qrRequests += 1;
      if (qrRequests === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary QR service failure" }),
        });
        return;
      }
      await route.continue();
    });

    await view.click();
    await expect(page).toHaveURL(/\/my-tickets\/event\/.+/);
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();
    await expect(page.getByText("E2E My Tickets Visitor")).toBeVisible();

    // A temporary QR API failure must be visible and recoverable, not a silent blank ticket.
    await expect(page.getByRole("alert").getByText("QR code couldn’t be loaded.")).toBeVisible();
    await page.getByRole("button", { name: "Retry QR code" }).click();
    await expect(page.getByRole("img", { name: new RegExp("QR code for " + EVENT_TITLE) })).toBeVisible();
    expect(qrRequests).toBe(2);
  });

  test("event-ticket list, detail, and QR APIs require an authenticated visitor", async ({ request }) => {
    const ticketId = "00000000-0000-4000-8000-000000000001";

    const mine = await request.get("/api/event-tickets/mine");
    expect(mine.status(), await mine.text()).toBe(401);

    const detail = await request.get(`/api/event-tickets/${ticketId}`);
    expect(detail.status(), await detail.text()).toBe(401);

    const qr = await request.get(`/api/event-tickets/${ticketId}/qr`);
    expect(qr.status(), await qr.text()).toBe(401);
  });

});
