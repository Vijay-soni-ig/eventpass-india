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

  test("does not expose an unpublished event through the public detail route", async ({ page, request }) => {
    const publicResponse = await request.get("/api/public/events/" + EVENT_ID);
    expect(publicResponse.ok()).toBeTruthy();

    const hiddenResponse = await request.get("/api/public/events/" + HIDDEN_EVENT_ID);
    expect(hiddenResponse.status()).toBe(404);

    await page.goto("/event/" + HIDDEN_EVENT_ID);
    await expect(page.getByRole("heading", { name: "Event not found" })).toBeVisible();
  });
});
