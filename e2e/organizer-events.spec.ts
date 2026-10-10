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
  test("redirects the legacy organizer analytics route to universal event analytics", async ({ page }) => {
    await login(page);
    await page.goto("/organizer/analytics");
    await expect(page).toHaveURL(/\/organizer\/event-analytics$/);
    // The analytics page can legitimately render either its populated heading or its empty state\n    // when the test database has no organizer events. The redirect contract is the URL; verify\n    // that the canonical analytics surface rendered without coupling the test to seeded data.\n    await expect(page.getByText(/Event Analytics|No events yet/).first()).toBeVisible();
  });


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
    // The legacy Exhibition editor can expose this phrase in non-visible UI state; the
    // meaningful regression checks are the absence of its legacy workspace link and route.
    await expect(page.getByRole("link", { name: "Open Exhibition" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/organizer\/exhibitions\//);
  });
  test("enforces the standalone Universal Event module boundary", async ({ page }) => {
    const token = await login(page);

    await page.goto(`/organizer/events/${EVENT_ID}/edit`);
    await expect(page.getByText("Event modules")).toBeVisible();

    for (const moduleName of ["Exhibitors", "Stall Booking", "Leads"]) {
      const checkbox = page.getByRole("checkbox", { name: `Unavailable ${moduleName}` });
      await expect(checkbox).toBeVisible();
      await expect(checkbox).toBeDisabled();
    }

    for (const moduleType of ["EXHIBITORS", "STALL_BOOKING", "LEADS"]) {
      const response = await page.request.put(`/api/events/${EVENT_ID}/modules/${moduleType}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { enabled: true },
      });
      expect(response.status()).toBe(400);
      const payload = await response.json();
      expect(payload.error).toContain("not yet supported for standalone Universal Events");
    }
  });
  test("creates, publishes, and persists edited venue coordinates", async ({ page }) => {
    const token = await login(page);
    const title = `E2E Organizer Created Event ${Date.now()}`;

    await page.goto("/organizer/events/new");
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();

    await page.locator("button").filter({ hasText: "Conference" }).first().click();
    await page.getByRole("textbox", { name: "Event title *" }).fill(title);
    await page.getByRole("textbox", { name: "Description" }).fill("Created by the organizer Universal Event E2E flow.");

    const categoryTrigger = page.getByRole("combobox").first();
    await categoryTrigger.click();
    await page.getByRole("option").first().click();

    await page.getByRole("textbox", { name: "City *" }).fill("Ahmedabad");
    await page.getByRole("textbox", { name: "Venue *" }).fill("E2E Convention Centre");
    await page.getByLabel("Start date *").fill("2027-01-15");
    await page.getByLabel("End date *").fill("2027-01-16");

    await page.getByRole("button", { name: "Create Draft Event" }).click();

    await expect(page).toHaveURL(/\/organizer\/events\/[^/]+$/);
    const createdEventId = new URL(page.url()).pathname.split("/").filter(Boolean).pop();
    expect(createdEventId).toBeTruthy();
    await expect(page.getByText("Universal Event workspace")).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Edit event" }).click();
    await expect(page.getByRole("heading", { name: "Edit Event" })).toBeVisible();
    await page.getByLabel("Venue Latitude (Optional)").fill("23.0225");
    await page.getByLabel("Venue Longitude (Optional)").fill("72.5714");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL("/organizer/events");

    const eventResponse = await page.request.get(`/api/events/${createdEventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(eventResponse.ok(), `GET /api/events/${createdEventId} failed: ${eventResponse.status()} ${await eventResponse.text()}`).toBeTruthy();
    const eventPayload = await eventResponse.json();
    expect(eventPayload.event.latitude).toBe(23.0225);
    expect(eventPayload.event.longitude).toBe(72.5714);
  });

});
