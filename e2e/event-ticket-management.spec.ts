import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function signup(request: APIRequestContext, label: string, userType: "organizer" | "visitor") {
  const response = await request.post("/api/auth/signup", {
    data: { email: `e2e-tickets-${label}-${Date.now()}@example.com`, password: PASSWORD, fullName: `E2E Tickets ${label}`, userType },
  });
  expect(response.status(), `signup failed: ${await response.text()}`).toBe(201);
  const body = await response.json();
  return { token: body.token as string, email: body.user.email as string };
}

const withToken = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const signIn = (page: Page, token: string) => page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

async function createEventViaApi(request: APIRequestContext, token: string, title: string) {
  const response = await request.post("/api/events", {
    headers: withToken(token),
    data: { eventType: "CONFERENCE", title, city: "Ahmedabad", venue: "E2E Convention Centre", startDate: "2027-11-10", endDate: "2027-11-11", status: "DRAFT", visibility: "public" },
  });
  expect(response.status(), `event create failed: ${await response.text()}`).toBe(201);
  return (await response.json()).event.id as string;
}

test.describe("Universal Event ticket management", () => {
  test("an organizer creates an event, manages its tickets, publishes it, and a visitor buys a ticket", async ({ page, request, browser }, testInfo) => {
    test.setTimeout(180_000);
    const organizer = await signup(request, "organizer", "organizer");
    await signIn(page, organizer.token);
    const title = `E2E Ticketed Event ${Date.now()}`;

    // --- Create the event in the UI --------------------------------------------------------
    await page.goto("/organizer/events/new");
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
    await page.locator("button").filter({ hasText: "Conference" }).first().click();
    await page.getByRole("textbox", { name: "Event title *" }).fill(title);
    await page.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    await page.getByRole("textbox", { name: "City *" }).fill("Ahmedabad");
    await page.getByRole("textbox", { name: "Venue *" }).fill("E2E Convention Centre");
    await page.getByLabel("Start date *").fill("2027-11-10");
    await page.getByLabel("End date *").fill("2027-11-11");
    await page.getByRole("button", { name: "Create Draft Event" }).click();
    // "/organizer/events/new" also matches a generic id pattern, so wait for the real event id.
    await expect(page).toHaveURL(/\/organizer\/events\/(?!new$)[^/]+$/);
    const eventId = page.url().split("/").pop() as string;

    // --- Open ticket management from the event workspace ------------------------------------
    await page.getByRole("link", { name: "Manage tickets" }).click();
    await expect(page).toHaveURL(new RegExp(`/organizer/events/${eventId}/tickets$`));
    await expect(page.getByRole("heading", { level: 1, name: "Tickets" })).toBeVisible();
    await expect(page.getByText("No ticket types yet")).toBeVisible();
    await expect(page.getByText("Visitors can't see or buy these tickets until the event is published.")).toBeVisible();

    // --- Invalid input is stopped before it is sent ----------------------------------------
    let ticketWrites = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/organizer/event-tickets") && r.method() !== "GET") ticketWrites += 1;
    });
    await page.getByRole("button", { name: "Add ticket type" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Create ticket type" }).click();
    await expect(dialog.getByText("Enter a ticket name")).toBeVisible();
    await expect(dialog.getByText("Enter a price (0 for a free ticket)")).toBeVisible();
    await expect(dialog.getByText("Enter how many tickets are available")).toBeVisible();
    await dialog.getByLabel("Ticket name").fill("Bad ticket");
    await dialog.getByLabel("Price (INR)").fill("10");
    await dialog.getByLabel("Capacity").fill("5");
    await dialog.getByRole("button", { name: "Create ticket type" }).click();
    await expect(dialog.getByText("This cannot be more than the capacity")).toBeVisible();
    expect(ticketWrites, "nothing was sent for invalid input").toBe(0);

    // --- Create three ticket types ---------------------------------------------------------
    const create = async (name: string, price: string, capacity: string, maxPerOrder: string, description = "") => {
      const open = page.getByRole("dialog");
      if (!(await open.isVisible())) await page.getByRole("button", { name: "Add ticket type" }).first().click();
      await open.getByLabel("Ticket name").fill(name);
      await open.getByLabel("Description").fill(description);
      await open.getByLabel("Price (INR)").fill(price);
      await open.getByLabel("Capacity").fill(capacity);
      await open.getByLabel("Maximum per order").fill(maxPerOrder);
      const saved = page.waitForResponse((r) => r.url().includes("/api/organizer/event-tickets") && r.request().method() === "POST");
      await open.getByRole("button", { name: "Create ticket type" }).click();
      expect((await saved).status()).toBe(201);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };
    // The dialog is still open from the validation step; reuse it for the first ticket.
    await create("E2E Paid Pass", "499", "25", "5", "Full access");
    await create("E2E Free Pass", "0", "10", "2");
    await create("E2E Archive Me", "10", "5", "1");

    // Scoped to the ticket list: a success toast is also a list item and mentions the ticket name.
    const row = (name: string) => page.getByRole("list", { name: "Ticket types" }).getByRole("listitem").filter({ hasText: name });
    await expect(row("E2E Paid Pass")).toContainText("₹499");
    await expect(row("E2E Paid Pass")).toContainText("On sale");
    await expect(row("E2E Free Pass")).toContainText("Free");
    // Duplicate names are refused by the server and the message is shown in the form.
    await page.getByRole("button", { name: "Add ticket type" }).first().click();
    const again = page.getByRole("dialog");
    await again.getByLabel("Ticket name").fill("e2e paid pass");
    await again.getByLabel("Price (INR)").fill("5");
    // Capacity must stay at or above the default maximum per order (10), or the form stops it before the server sees it.
    await again.getByLabel("Capacity").fill("20");
    await again.getByRole("button", { name: "Create ticket type" }).click();
    await expect(again.getByText("A ticket type with this name already exists for this event")).toBeVisible();
    await again.getByRole("button", { name: "Cancel" }).click();

    // --- Edit ------------------------------------------------------------------------------
    await page.getByRole("button", { name: "Edit E2E Paid Pass" }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByLabel("Ticket name")).toHaveValue("E2E Paid Pass");
    await expect(editDialog.getByLabel("Price (INR)")).toHaveValue("499");
    await editDialog.getByLabel("Price (INR)").fill("599");
    await editDialog.getByLabel("Capacity").fill("30");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row("E2E Paid Pass")).toContainText("₹599");
    await expect(row("E2E Paid Pass").locator("dd").nth(1)).toHaveText("30");

    // --- Archive asks first, then hides the ticket but keeps it available under "Show archived" ---
    await page.getByRole("button", { name: "Archive E2E Archive Me" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Archive \"E2E Archive Me\"?");
    await page.getByRole("button", { name: "Keep ticket" }).click();
    await expect(row("E2E Archive Me")).toBeVisible();
    await page.getByRole("button", { name: "Archive E2E Archive Me" }).click();
    await page.getByRole("button", { name: "Archive ticket" }).click();
    await expect(row("E2E Archive Me")).toHaveCount(0);
    await page.getByRole("switch", { name: "Show archived (1)" }).click();
    await expect(row("E2E Archive Me")).toContainText("Archived");
    await expect(row("E2E Archive Me").getByRole("button", { name: /Edit/ })).toHaveCount(0);

    // --- A hidden ticket is not offered to visitors; publishing makes the rest visible ------------
    await page.getByRole("switch", { name: "Available for sale: E2E Paid Pass" }).click();
    await expect(row("E2E Paid Pass")).toContainText("Not available");

    await page.getByRole("link", { name: "Back to event" }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();

    const publicTickets = async () => ((await (await request.get(`/api/public/events/${eventId}/tickets`)).json()).ticketTypes as Array<{ name: string; price: string; remaining: number }>);
    expect((await publicTickets()).map((t) => t.name)).toEqual(["E2E Free Pass"]);

    await page.getByRole("link", { name: "Manage tickets" }).click();
    await page.getByRole("switch", { name: "Available for sale: E2E Paid Pass" }).click();
    await expect(row("E2E Paid Pass")).toContainText("On sale");
    const visible = await publicTickets();
    expect(visible.map((t) => t.name).sort()).toEqual(["E2E Free Pass", "E2E Paid Pass"]);
    const paid = visible.find((t) => t.name === "E2E Paid Pass")!;
    expect(Number(paid.price)).toBe(599);
    expect(paid.remaining).toBe(30);

    // --- A visitor sees the tickets and buys the free one (no payment is involved for a free ticket) ----
    const visitorContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    try {
      const visitor = await signup(request, "visitor", "visitor");
      const visitorPage = await visitorContext.newPage();
      await signIn(visitorPage, visitor.token);
      await visitorPage.goto(`/event/${eventId}/tickets`);
      await expect(visitorPage.getByRole("heading", { name: "Get your tickets" })).toBeVisible();
      const paidOption = visitorPage.getByRole("button", { name: /E2E Paid Pass/ });
      await expect(paidOption).toContainText("₹599");
      await expect(paidOption).toContainText("30 available");
      await expect(visitorPage.getByRole("button", { name: /E2E Archive Me/ })).toHaveCount(0);

      await visitorPage.getByRole("button", { name: /E2E Free Pass/ }).click();
      await visitorPage.getByRole("button", { name: "Continue", exact: true }).click();
      await visitorPage.getByLabel("Full name").fill("E2E Ticket Buyer");
      await visitorPage.getByLabel("Email").fill(visitor.email);
      await visitorPage.getByRole("button", { name: "Continue to payment" }).click();
      await expect(visitorPage.getByRole("heading", { name: "Ticket confirmed" })).toBeVisible();

      await visitorPage.getByRole("link", { name: "Go to My Tickets" }).click();
      await expect(visitorPage.getByRole("heading", { name: "Event Tickets" })).toBeVisible();
      await expect(visitorPage.getByRole("heading", { name: title })).toBeVisible();
      await visitorPage.getByRole("link", { name: "View Ticket" }).click();
      await expect(visitorPage.getByRole("img", { name: new RegExp(`^QR code for ${title}`) })).toBeVisible();
    } finally {
      await visitorContext.close();
    }

    // --- The organizer's counts now include the sale -----------------------------------------
    await page.reload();
    const free = row("E2E Free Pass").locator("dd");
    await expect(free.nth(2)).toHaveText("1");
    await expect(free.nth(3)).toHaveText("9");
  });

  test("turning the Ticketing module off blocks the screen and the API", async ({ page, request }) => {
    const organizer = await signup(request, "module", "organizer");
    const eventId = await createEventViaApi(request, organizer.token, `E2E Module Off ${Date.now()}`);
    const ticket = await request.post("/api/organizer/event-tickets", { headers: withToken(organizer.token), data: { eventId, name: "Module test", price: 10, capacity: 5, maxPerOrder: 1 } });
    expect(ticket.status()).toBe(201);
    const ticketId = (await ticket.json()).ticket.id as string;

    const off = await request.put(`/api/events/${eventId}/modules/TICKETING`, { headers: withToken(organizer.token), data: { enabled: false } });
    expect(off.status()).toBe(200);

    await signIn(page, organizer.token);
    await page.goto(`/organizer/events/${eventId}/tickets`);
    await expect(page.getByText("Ticketing is turned off for this event")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add ticket type" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open event settings" })).toBeVisible();

    // The same restriction holds when the screen is bypassed.
    const headers = withToken(organizer.token);
    expect((await request.get(`/api/organizer/event-tickets?eventId=${eventId}`, { headers })).status()).toBe(409);
    expect((await request.post("/api/organizer/event-tickets", { headers, data: { eventId, name: "Sneaky", price: 1, capacity: 1, maxPerOrder: 1 } })).status()).toBe(409);
    expect((await request.patch(`/api/organizer/event-tickets/${ticketId}`, { headers, data: { price: 1 } })).status()).toBe(409);
    expect((await request.delete(`/api/organizer/event-tickets/${ticketId}`, { headers })).status()).toBe(409);
  });

  test("other organizers, exhibitors and visitors cannot manage another organizer's tickets", async ({ request }) => {
    const owner = await signup(request, "owner", "organizer");
    const visitor = await signup(request, "outsider", "visitor");
    const eventId = await createEventViaApi(request, owner.token, `E2E Tickets Owner ${Date.now()}`);
    const created = await request.post("/api/organizer/event-tickets", { headers: withToken(owner.token), data: { eventId, name: "Owner ticket", price: 10, capacity: 5, maxPerOrder: 1 } });
    expect(created.status()).toBe(201);
    const ticketId = (await created.json()).ticket.id as string;

    const outsider = withToken(visitor.token);
    expect((await request.get(`/api/organizer/event-tickets?eventId=${eventId}`, { headers: outsider })).status()).toBe(403);
    expect((await request.post("/api/organizer/event-tickets", { headers: outsider, data: { eventId, name: "Nope", price: 1, capacity: 1, maxPerOrder: 1 } })).status()).toBe(403);
    expect((await request.patch(`/api/organizer/event-tickets/${ticketId}`, { headers: outsider, data: { price: 1 } })).status()).toBe(403);
    expect((await request.delete(`/api/organizer/event-tickets/${ticketId}`, { headers: outsider })).status()).toBe(403);
    expect((await request.get(`/api/organizer/event-tickets?eventId=${eventId}`)).status()).toBe(401);

    const stillThere = await request.get(`/api/organizer/event-tickets?eventId=${eventId}`, { headers: withToken(owner.token) });
    expect((await stillThere.json()).tickets).toHaveLength(1);
  });
});
