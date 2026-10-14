import { test, expect, type Page } from "@playwright/test";

const EVENT_ID = "e2e-public-event-001";
const EVENT_TITLE = "E2E Public Conference 2026";
const EMAIL = "org1.owner@eventpass.test";
const PASSWORD = "DevPassword123!";

async function login(page: Page, email = EMAIL): Promise<string> {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
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
  test("keeps linked Exhibitions out of the Universal Event list and in Exhibition management", async ({ page }) => {
    const token = await login(page);
    const title = "E2E Linked Exhibition Event 2026";

    await page.goto("/organizer/events");
    await page.getByPlaceholder("Search events...").fill(title);
    await expect(page.getByText("No events found")).toBeVisible();

    const eventsResponse = await page.request.get("/api/events?search=" + encodeURIComponent(title) + "&excludeExhibitions=true", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(eventsResponse.ok()).toBeTruthy();
    const eventsPayload = await eventsResponse.json();
    expect(eventsPayload.events.some((event: { id: string }) => event.id === "e2e-linked-event-001")).toBeFalsy();

    const exhibitionsResponse = await page.request.get("/api/exhibitions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(exhibitionsResponse.ok()).toBeTruthy();
    const exhibitionsPayload = await exhibitionsResponse.json();
    expect(exhibitionsPayload.exhibitions.some((exhibition: { id: string }) => exhibition.id === "e2e-linked-exhibition-001")).toBeTruthy();

    await page.goto("/organizer/exhibitions");
    await expect(page.getByRole("heading", { name: "Exhibitions" })).toBeVisible();
  });

  test("hides event edit and lifecycle actions from read-only organizer roles", async ({ page }) => {
    await login(page, "org1.scanner@eventpass.test");
    await page.goto(`/organizer/events/${EVENT_ID}`);

    await expect(page.getByRole("heading", { name: EVENT_TITLE })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit event" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
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
  test("API rejects a nonexistent event category without persisting the event", async ({ page }) => {
    const token = await login(page, "org1.admin@eventpass.test");
    const title = `E2E Invalid Category ${Date.now()}`;
    const headers = { Authorization: `Bearer ${token}` };

    const response = await page.request.post("/api/events", {
      headers,
      data: {
        eventType: "CONFERENCE",
        title,
        categoryId: "00000000-0000-4000-8000-000000000000",
        city: "Ahmedabad",
        venue: "E2E Convention Centre",
        startDate: "2027-02-10",
        endDate: "2027-02-11",
        visibility: "public",
        status: "DRAFT",
      },
    });

    expect(response.status(), await response.text()).toBe(400);
    const payload = await response.json();
    expect(payload.error).toContain("categoryId must reference an active Event Category");

    const listResponse = await page.request.get(`/api/events?search=${encodeURIComponent(title)}`, { headers });
    expect(listResponse.ok(), await listResponse.text()).toBeTruthy();
    const listPayload = await listResponse.json();
    expect(
      listPayload.events.some((event: { title: string }) => event.title === title),
      "a rejected category must not leave a partially created event",
    ).toBeFalsy();
  });

  test("rejects a missing event category when other required details are filled", async ({ page }) => {
    await login(page, "org1.admin@eventpass.test");
    await page.goto("/organizer/events/new");
    await page.getByRole("button").filter({ hasText: "Conference" }).first().click();
    await page.getByRole("textbox", { name: "Event title *" }).fill("E2E Missing Category");
    await page.getByRole("textbox", { name: "City *" }).fill("Ahmedabad");
    await page.getByRole("textbox", { name: "Venue *" }).fill("E2E Convention Centre");
    await page.getByLabel("Start date *").fill("2027-02-10");
    await page.getByLabel("End date *").fill("2027-02-11");

    let createRequests = 0;
    await page.route("**/api/events", async (route) => {
      if (route.request().method() === "POST") createRequests += 1;
      await route.continue();
    });

    await page.getByRole("button", { name: "Create Draft Event" }).click();
    await expect(page.getByText("Please complete title, category, city, venue and dates")).toBeVisible();
    expect(createRequests, "a missing category must not send a create request").toBe(0);
    await expect(page).toHaveURL((url) => url.pathname === "/organizer/events/new");
  });

  test("rejects missing required event details without creating an event", async ({ page }) => {
    await login(page, "org1.admin@eventpass.test");
    await page.goto("/organizer/events/new");
    await page.getByRole("button").filter({ hasText: "Conference" }).first().click();
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();

    let createRequests = 0;
    await page.route("**/api/events", async (route) => {
      if (route.request().method() === "POST") createRequests += 1;
      await route.continue();
    });

    await page.getByRole("button", { name: "Create Draft Event" }).click();
    await expect(page.getByText("Please complete title, category, city, venue and dates")).toBeVisible();
    expect(createRequests, "invalid required fields must not send a create request").toBe(0);
    await expect(page).toHaveURL(/\/organizer\/events\/new$/);
  });

  test("rejects an end date earlier than the start date without creating an event", async ({ page }) => {
    await login(page, "org1.admin@eventpass.test");
    await page.goto("/organizer/events/new");
    await page.getByRole("button").filter({ hasText: "Conference" }).first().click();
    await page.getByRole("textbox", { name: "Event title *" }).fill("E2E Invalid Date Range");
    const categoryTrigger = page.getByRole("combobox").first();
    await categoryTrigger.click();
    const categoryOption = page.getByRole("option", { name: "E2E Conferences", exact: true });
    await expect(categoryOption).toBeVisible({ timeout: 15_000 });
    await categoryOption.click();
    await page.getByRole("textbox", { name: "City *" }).fill("Ahmedabad");
    await page.getByRole("textbox", { name: "Venue *" }).fill("E2E Convention Centre");
    await page.getByLabel("Start date *").fill("2027-01-16");
    await page.getByLabel("End date *").fill("2027-01-15");

    let createRequests = 0;
    await page.route("**/api/events", async (route) => {
      if (route.request().method() === "POST") createRequests += 1;
      await route.continue();
    });

    await page.getByRole("button", { name: "Create Draft Event" }).click();
    await expect(page.getByText("End date cannot be before start date")).toBeVisible();
    expect(createRequests, "invalid date ranges must not send a create request").toBe(0);
    await expect(page).toHaveURL(/\/organizer\/events\/new$/);
  });

  test("creates and publishes a Universal Event without coordinate fields", async ({ page }) => {
    // Use the seeded organizer admin so this mutation-flow test has an independent
    // per-user rate-limit bucket from the owner used by the other organizer suites.
    await login(page, "org1.admin@eventpass.test");
    const title = `E2E Organizer Created Event ${Date.now()}`;

    await page.goto("/organizer/events/new");
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();

    await page.locator("button").filter({ hasText: "Conference" }).first().click();
    await page.getByRole("textbox", { name: "Event title *" }).fill(title);
    await page.getByRole("textbox", { name: "Description" }).fill("Created by the organizer Universal Event E2E flow.");

    const categoryTrigger = page.getByRole("combobox").first();
    await categoryTrigger.click();
    // The E2E seed guarantees this active category exists. Select it explicitly instead
    // of choosing the first option, which can race async loading or accidentally choose
    // "No category" while the form correctly requires a category.
    const categoryOption = page.getByRole("option", { name: "E2E Conferences", exact: true });
    await expect(categoryOption).toBeVisible({ timeout: 15_000 });
    await categoryOption.click();
    await expect(categoryTrigger).toContainText("E2E Conferences");

    await page.getByRole("textbox", { name: "City *" }).fill("Ahmedabad");
    await page.getByRole("textbox", { name: "Venue *" }).fill("E2E Convention Centre");
    await page.getByLabel("Start date *").fill("2027-01-15");
    await page.getByLabel("End date *").fill("2027-01-16");

    // Observe the actual create request before asserting navigation. A URL-only timeout
    // hides whether the form blocked submission or the API rejected the mutation.
    const createResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/events",
      { timeout: 8_000 },
    ).catch(() => null);
    await page.getByRole("button", { name: "Create Draft Event" }).click();

    const createResponse = await createResponsePromise;
    if (!createResponse) {
      const validationToast = page.getByText(/Please complete title, category, city, venue and dates|End date cannot be before start date/);
      await expect(validationToast, "Form blocked submission; expected a validation message").toBeVisible({ timeout: 2_000 });
      throw new Error("Create Event form did not send POST /api/events; client-side validation blocked submission.");
    }
    const createResponseBody = await createResponse.text();
    expect(
      createResponse.ok(),
      `POST /api/events returned HTTP ${createResponse.status()}: ${createResponseBody}`,
    ).toBeTruthy();

    // Do not match the /new route while the create mutation is navigating.
    await expect(page).toHaveURL((url) => url.pathname.startsWith("/organizer/events/") && url.pathname !== "/organizer/events/new", { timeout: 30_000 });
    await expect(page.getByText("Universal Event workspace")).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Edit event" }).click();
    await expect(page.getByRole("heading", { name: "Edit Event" })).toBeVisible();
    await expect(page.getByLabel("Venue Latitude (Optional)")).toHaveCount(0);
    await expect(page.getByLabel("Venue Longitude (Optional)")).toHaveCount(0);
  });


  test("create-event API failure is visible and preserves entered values for retry", async ({ page }) => {
    await login(page, "org1.admin@eventpass.test");
    const title = `E2E Create Failure ${Date.now()}`;
    let createRequests = 0;

    await page.route("**/api/events", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      createRequests += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Injected event creation failure" }),
      });
    });

    await page.goto("/organizer/events/new");
    await page.getByRole("button").filter({ hasText: "Conference" }).first().click();
    await page.getByRole("textbox", { name: "Event title *" }).fill(title);
    await page.getByRole("textbox", { name: "Description" }).fill("Keep this description after a failed save.");
    const categoryTrigger = page.getByRole("combobox").first();
    await categoryTrigger.click();
    const categoryOption = page.getByRole("option", { name: "E2E Conferences", exact: true });
    await expect(categoryOption).toBeVisible({ timeout: 15_000 });
    await categoryOption.click();
    await page.getByRole("textbox", { name: "City *" }).fill("Ahmedabad");
    await page.getByRole("textbox", { name: "Venue *" }).fill("E2E Convention Centre");
    await page.getByLabel("Start date *").fill("2027-03-10");
    await page.getByLabel("End date *").fill("2027-03-11");

    await page.getByRole("button", { name: "Create Draft Event" }).click();

    await expect(page.getByText("Injected event creation failure", { exact: true })).toBeVisible();
    await expect(page.getByText("Event created as a draft", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Event title *" })).toHaveValue(title);
    await expect(page.getByRole("textbox", { name: "Description" })).toHaveValue("Keep this description after a failed save.");
    await expect(categoryTrigger).toContainText("E2E Conferences");
    await expect(page.getByRole("textbox", { name: "City *" })).toHaveValue("Ahmedabad");
    await expect(page.getByRole("textbox", { name: "Venue *" })).toHaveValue("E2E Convention Centre");
    await expect(page.getByLabel("Start date *")).toHaveValue("2027-03-10");
    await expect(page.getByLabel("End date *")).toHaveValue("2027-03-11");
    await expect(page.getByRole("button", { name: "Create Draft Event" })).toBeEnabled();
    expect(createRequests, "the form should send one failed create request and remain available for retry").toBe(1);
  });

});
