import { test, expect } from "@playwright/test";

const EVENT_ID = "e2e-public-event-001";
const EVENT_TITLE = "E2E Public Conference 2026";
const HIDDEN_EVENT_ID = "e2e-hidden-event-001";

test.describe("Universal public Event", () => {
  test("discovers a published event and opens its detail page", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Find events worth attending" })).toBeVisible();

    const eventCard = page.getByRole("heading", { name: EVENT_TITLE });
    await expect(eventCard).toBeVisible();

    await eventCard.click();
    await expect(page).toHaveURL(new RegExp("/event/" + EVENT_ID + "$"));
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();
    await expect(page.getByText("E2E Convention Centre, Ahmedabad")).toBeVisible();

    // The public API only returns enabled modules (no `enabled` flag); the page
    // must still treat TICKETING as on and offer the ticket entry point.
    await expect(page.getByRole("link", { name: /View tickets|View ticket options/ })).toBeVisible();

    // Universal events must stay on the universal public surface and must
    // not fall back to an Exhibition-only route or CTA.
    await expect(page.getByRole("link", { name: "Open Exhibition" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Legacy exhibition/i })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/exhibition\//);
  });

  test("reads linked Exhibition tickets through the canonical Event surface", async ({ page, request }) => {
    const detail = await request.get("/api/public/events/e2e-linked-event-001");
    expect(detail.ok()).toBeTruthy();
    const payload = await detail.json();
    expect(payload.event.id).toBe("e2e-linked-event-001");
    expect(payload.linkedExhibitionId).toBe("e2e-linked-exhibition-001");

    const tickets = await request.get("/api/public/events/e2e-linked-event-001/tickets");
    expect(tickets.ok()).toBeTruthy();
    const ticketPayload = await tickets.json();
    expect(ticketPayload.legacyExhibitionId).toBe("e2e-linked-exhibition-001");
    expect(ticketPayload.ticketTypes.some((ticket) => ticket.id === "e2e-linked-exhibition-ticket-001")).toBeTruthy();

    await page.goto("/event/e2e-linked-event-001");
    await expect(page.getByRole("heading", { name: "E2E Linked Exhibition Event 2026" })).toBeVisible();
    await expect(page.getByText("E2E Linked Visitor Pass", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View tickets", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View exhibition tickets", exact: true })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/exhibition\//);

    await page.getByRole("link", { name: "View tickets", exact: true }).first().click();
    await expect(page).toHaveURL(/\/event\/e2e-linked-event-001\/tickets$/);
    await expect(page.getByRole("heading", { name: "Get your tickets" })).toBeVisible();
    await expect(page.getByText("E2E Linked Visitor Pass", { exact: true }).first()).toBeVisible();

    const ticket = page.getByRole("button", { name: /E2E Linked Visitor Pass/i }).first();
    await ticket.click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/\/book\/e2e-linked-exhibition-001\?ticket=e2e-linked-exhibition-ticket-001/);
  });

  test("routes confirmed linked Event registration to canonical Event tickets", async ({ page }) => {
    await page.goto("/event/e2e-linked-event-001/register");
    await expect(page.getByRole("heading", { name: "E2E Linked Exhibition Event 2026" })).toBeVisible();
    await page.getByLabel("Full name").fill("E2E Registration Visitor");
    await page.getByLabel("Email").fill(`e2e-registration-${Date.now()}@example.com`);
    await page.getByLabel(/consent/i).check();
    await page.getByRole("button", { name: "Complete registration" }).click();

    await expect(page.getByRole("heading", { name: "You're registered" })).toBeVisible();
    await page.getByRole("link", { name: "Continue to tickets" }).click();
    await expect(page).toHaveURL(/\/event\/e2e-linked-event-001\/tickets\?registration=[^&]+$/);
    await expect(page.getByRole("heading", { name: "Get your tickets" })).toBeVisible();
  });

  test("public event payload carries the SEO fields the detail page reads", async ({ request }) => {
    const response = await request.get("/api/public/events/" + EVENT_ID);
    expect(response.ok()).toBeTruthy();
    const { event } = await response.json();
    for (const key of ["seoTitle", "seoDescription", "seoImageUrl"]) {
      expect(Object.prototype.hasOwnProperty.call(event, key), key).toBeTruthy();
    }
  });

  test("opens universal ticketing without an Exhibition dependency", async ({ page, request }) => {
    const response = await request.get("/api/public/events/" + EVENT_ID + "/tickets");
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.event.id).toBe(EVENT_ID);
    expect(payload.ticketTypes).toHaveLength(1);
    expect(payload.ticketTypes[0].name).toBe("E2E Free Visitor Pass");
    expect(payload.ticketTypes[0].soldOut).toBe(false);

    await page.goto("/event/" + EVENT_ID + "/tickets");
    await expect(page.getByRole("heading", { name: "Get your tickets" })).toBeVisible();
    await expect(page.getByText("E2E Free Visitor Pass", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/exhibition\//);
  });

  test("marks the unused legacy event discovery API as deprecated", async ({ request }) => {
    const response = await request.get("/api/public/discover?type=events&page=1&limit=1");
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["deprecation"]).toBe("true");
    expect(response.headers()["link"]).toContain("</api/public/events>");
  });

  test("preserves legacy /exhibitions search and category query compatibility", async ({ page, request }) => {
    await page.goto("/exhibitions?search=" + encodeURIComponent(EVENT_TITLE));
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();

    const categoryResponse = await request.get("/api/public/events/" + EVENT_ID);
    expect(categoryResponse.ok()).toBeTruthy();
    const { event } = await categoryResponse.json();
    expect(event.category?.id).toBeTruthy();

    await page.goto("/exhibitions?category=" + encodeURIComponent(event.category.id));
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();

    // The compatibility URL must use the Universal Event discovery surface,
    // not render the removed legacy Exhibition listing.
    await expect(page.getByRole("heading", { name: "Find events worth attending" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Legacy exhibitions" })).toHaveCount(0);
  });

  test("searches and filters the public discovery list", async ({ page, request }) => {
    await page.goto("/events");
    await page.getByRole("textbox", { name: "Search events" }).fill(EVENT_TITLE);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page).toHaveURL(/q=E2E/);
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();

    const response = await request.get("/api/public/events?q=" + encodeURIComponent(EVENT_TITLE));
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].id).toBe(EVENT_ID);
  });

  test("filters the discovery list by category and city without per-keystroke requests", async ({ page, request }) => {
    const detail = await request.get("/api/public/events/" + EVENT_ID);
    expect(detail.ok()).toBeTruthy();
    const { event } = await detail.json();
    expect(event.category?.id).toBeTruthy();
    expect(event.city).toBe("Ahmedabad");

    await page.goto("/events");
    await page.getByRole("combobox", { name: "Filter by category" }).click();
    await page.getByRole("option", { name: event.category.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp("categoryId=" + event.category.id));

    await page.getByRole("textbox", { name: "Filter by city" }).fill("Ahmedabad");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page).toHaveURL(/categoryId=.*city=Ahmedabad|city=Ahmedabad.*categoryId=/);
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();
  });

  test("does not expose an unpublished event through the public detail route", async ({ page, request }) => {
    const publicResponse = await request.get("/api/public/events/" + EVENT_ID);
    expect(publicResponse.ok()).toBeTruthy();

    const hiddenResponse = await request.get("/api/public/events/" + HIDDEN_EVENT_ID);
    expect(hiddenResponse.status()).toBe(404);

    await page.goto("/event/" + HIDDEN_EVENT_ID);
    await expect(page.getByRole("heading", { name: "Event not found" })).toBeVisible();
  });
});
