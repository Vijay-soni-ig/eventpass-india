import { test, expect } from "@playwright/test";

const EVENT_ID = "e2e-public-event-001";
const EVENT_TITLE = "E2E Public Conference 2026";
const PASSWORD = "DevPassword123!";

test.describe("My Tickets", () => {
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
    await page.route(/\\/api\\/event-tickets\\/[^/]+\\/qr$/, async (route) => {
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
    await expect(page).toHaveURL(/\\/my-tickets\\/event\\/.+/);
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();
    await expect(page.getByText("E2E My Tickets Visitor")).toBeVisible();

    // A temporary QR API failure must be visible and recoverable, not a silent blank ticket.
    await expect(page.getByRole("alert").getByText("QR code couldn’t be loaded.")).toBeVisible();
    await page.getByRole("button", { name: "Retry QR code" }).click();
    await expect(page.getByRole("img", { name: new RegExp("QR code for " + EVENT_TITLE) })).toBeVisible();
    expect(qrRequests).toBe(2);
  });
});
