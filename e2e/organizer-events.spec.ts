import { test, expect, type Page } from "@playwright/test";

const EVENT_ID = "e2e-public-event-001";
const EVENT_TITLE = "E2E Public Conference 2026";
const EMAIL = "org1.owner@eventpass.test";
const PASSWORD = "DevPassword123!";

async function login(page: Page): Promise<string> {
  const response = await page.request.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
  return payload.token;
}

test.describe("Organizer Universal Event flows", () => {
  test("keeps a non-Exhibition event on the universal list, overview and editor routes", async ({ page }) => {
    const token = await login(page);

    await page.goto("/organizer/events");
    await page.waitForLoadState("networkidle");
    const eventsResponse = await page.request.get("/api/events?search=" + encodeURIComponent(EVENT_TITLE), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(eventsResponse.ok()).toBeTruthy();
    const eventsPayload = await eventsResponse.json();
    expect(eventsPayload.events.some((event: { id: string; title: string }) => event.id === EVENT_ID && event.title === EVENT_TITLE)).toBeTruthy();
    // The list is paginated (20, newest first) and earlier specs create many events, so
    // narrow it with the page's own search box instead of relying on page 1 contents.
    await page.getByPlaceholder("Search events...").fill(EVENT_TITLE);
    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();

    const eventCard = page.locator("div.rounded-xl.border").filter({ hasText: EVENT_TITLE }).first();
    await expect(eventCard).toBeVisible();
    await expect(eventCard.getByRole("link", { name: "Open Exhibition" })).toHaveCount(0);
    await expect(eventCard.getByRole("link", { name: "Open" })).toBeVisible();
    await expect(eventCard.getByRole("link", { name: "Edit" })).toBeVisible();

    await eventCard.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(new RegExp("/organizer/events/" + EVENT_ID + "$"));
    await expect(page.getByText("Universal Event workspace")).toBeVisible();
    await expect(page.getByText("CONFERENCE", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open exhibition workspace" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Manage participants" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Preview registration" })).toBeVisible();
    // The seeded event has the TICKETING module enabled, so the link is expected -- and it must
    // stay on the universal event route rather than an Exhibition one.
    await expect(page.getByRole("link", { name: "Preview ticketing" })).toHaveAttribute("href", "/event/" + EVENT_ID + "/tickets");
    await expect(page).not.toHaveURL(/\/organizer\/exhibitions\//);

    await page.getByRole("link", { name: "Edit event" }).click();
    await expect(page).toHaveURL(new RegExp("/organizer/events/" + EVENT_ID + "/edit$"));
    await expect(page.getByRole("heading", { name: "Edit Event" })).toBeVisible();
    await expect(page.getByText("Event ID " + EVENT_ID)).toBeVisible();
    await expect(page.getByText("Event modules")).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage Participants" })).toHaveCount(0);
    await expect(page.getByText("Exhibition event")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open Exhibition" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/organizer\/exhibitions\//);
  });
  test("creates a Universal Event and reaches the publish action from the event workspace", async ({ page }) => {
    await login(page);
    const title = `E2E Organizer Created Event ${Date.now()}`;

    await page.goto("/organizer/events/new");
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();

    await page.getByRole("button", { name: "Conference", exact: true }).click();
    await page.getByRole("textbox", { name: "Event title *" }).fill(title);
    await page.getByRole("textbox", { name: "Description" }).fill("Created by the organizer Universal Event E2E flow.");

    const categoryTrigger = page.getByRole("combobox").first();
    await categoryTrigger.click();
    await page.getByRole("option").first().click();

    await page.getByRole("textbox", { name: "City *" }).fill("Ahmedabad");
    await page.getByRole("textbox", { name: "Venue *" }).fill("E2E Convention Centre");
    await page.getByRole("textbox", { name: "Start date *" }).fill("2027-01-15");
    await page.getByRole("textbox", { name: "End date *" }).fill("2027-01-16");

    await page.getByRole("button", { name: "Create Draft Event" }).click();

    await expect(page).toHaveURL(/\/organizer\/events\/[^/]+$/);
    await expect(page.getByText("Universal Event workspace")).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
  });

});
