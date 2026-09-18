import { test, expect } from "@playwright/test";

const EVENT_ID = "e2e-public-event-001";
const EVENT_TITLE = "E2E Public Conference 2026";

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
    await expect(page.getByText("E2E test event")).toHaveCount(0);
  });

  test("searches and filters the public discovery list", async ({ page }) => {
    await page.goto("/events");
    await page.getByRole("textbox", { name: "Search events" }).fill(EVENT_TITLE);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page).toHaveURL(/q=E2E/);
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();
    await expect(page.getByText(/1 all events/i)).toBeVisible();
  });

  test("does not expose a hidden event through the public detail route", async ({ page, request }) => {
    const hiddenId = "e2e-hidden-event-001";
    const createResponse = await request.post("/api/events", {
      data: {
        title: "E2E Hidden Event",
        eventType: "CONFERENCE",
        description: "Must never be public.",
      },
      headers: { Authorization: "Bearer invalid" },
    });
    expect(createResponse.status()).not.toBe(200);
    await page.goto("/event/" + hiddenId);
    await expect(page.getByRole("heading", { name: "Event not found" })).toBeVisible();
  });
});
