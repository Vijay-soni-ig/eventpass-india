import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

const withToken = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function createOrganizer(request: APIRequestContext, page: Page) {
  const response = await request.post("/api/auth/signup", {
    data: {
      email: `e2e-keyboard-dialog-${Date.now()}@example.com`,
      password: PASSWORD,
      fullName: "E2E Keyboard Dialog",
      userType: "organizer",
    },
  });
  expect(response.status(), `organizer signup failed: ${await response.text()}`).toBe(201);
  const payload = await response.json();
  const token = payload.token as string;

  const profile = await request.put("/api/organizer/profile", {
    headers: withToken(token),
    data: {
      businessType: "Private Limited",
      address: "12 Ashram Road, Navrangpura, Ahmedabad 380009",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
      description: "E2E organizer for keyboard accessibility checks.",
      website: "https://example.com",
      slug: `e2e-keyboard-${Date.now()}`,
      publicProfileEnabled: false,
    },
  });
  expect(profile.status(), `organizer profile setup failed: ${await profile.text()}`).toBe(200);

  const eventResponse = await request.post("/api/events", {
    headers: withToken(token),
    data: {
      eventType: "CONFERENCE",
      title: `Keyboard Audit Event ${Date.now()}`,
      city: "Ahmedabad",
      venue: "E2E Convention Centre",
      startDate: "2027-11-10",
      endDate: "2027-11-11",
      status: "DRAFT",
      visibility: "public",
    },
  });
  expect(eventResponse.status(), `event setup failed: ${await eventResponse.text()}`).toBe(201);
  const eventPayload = await eventResponse.json();

  await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
  return eventPayload.event.id as string;
}

test.describe("Keyboard interaction and focus management", () => {
  test("ticket dialog traps focus, closes with Escape, and restores focus to its trigger", async ({ page, request }) => {
    const eventId = await createOrganizer(request, page);
    await page.goto(`/organizer/events/${eventId}/tickets`);
    await expect(page.getByRole("heading", { level: 1, name: "Tickets" })).toBeVisible();

    const trigger = page.getByRole("button", { name: "Add ticket type" }).first();
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Add ticket type" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Ticket name" })).toBeVisible();

    // Tab through the modal's controls and ensure focus never escapes to the page behind it.
    for (let index = 0; index < 18; index += 1) {
      await page.keyboard.press("Tab");
      const focusIsInsideDialog = await page.evaluate(() => {
        const dialogElement = document.querySelector('[role="dialog"]');
        return Boolean(dialogElement && document.activeElement && dialogElement.contains(document.activeElement));
      });
      expect(focusIsInsideDialog, `Tab ${index + 1} should remain inside the open dialog`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("ticket form keyboard submission focuses the first invalid field and exposes its error", async ({ page, request }) => {
    const eventId = await createOrganizer(request, page);
    await page.goto(`/organizer/events/${eventId}/tickets`);
    const trigger = page.getByRole("button", { name: "Add ticket type" }).first();
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Add ticket type" });
    await expect(dialog).toBeVisible();
    const submit = dialog.getByRole("button", { name: "Create ticket type" });
    await submit.focus();
    await page.keyboard.press("Enter");

    const name = dialog.getByRole("textbox", { name: "Ticket name" });
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    const describedBy = await name.getAttribute("aria-describedby");
    expect(describedBy).toContain("ticket-name-error");
    await expect(dialog.getByText("Enter a ticket name")).toBeVisible();
  });

  test("organizer event type choices activate with Enter and form validation is announced", async ({ page }) => {
    const response = await page.request.post("/api/auth/login", {
      data: { email: "org1.owner@eventpass.test", password: PASSWORD },
    });
    expect(response.ok(), `organizer login failed: ${await response.text()}`).toBeTruthy();
    const payload = await response.json();
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await page.goto("/organizer/events/new");
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
    const conference = page.getByRole("button", { name: /Conference Multi-session professional/ });
    await conference.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Conference", exact: true })).toBeVisible();

    const submit = page.getByRole("button", { name: "Create Draft Event" });
    await submit.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Please complete title, category, city, venue and dates")).toBeVisible();
  });

  test("mobile navigation can be opened, traversed, and closed with the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const openToggle = page.getByRole("button", { name: "Open menu" });
    await openToggle.focus();
    await page.keyboard.press("Enter");
    const closeToggle = page.getByRole("button", { name: "Close menu" });
    await expect(closeToggle).toHaveAttribute("aria-expanded", "true");

    const search = page.getByRole("textbox", { name: "Search exhibitions" });
    await page.keyboard.press("Tab");
    await expect(search).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(closeToggle).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });

  test("desktop city menu closes with Escape and restores trigger focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/exhibitions");
    const trigger = page.getByRole("button", { name: /Location:.*Change location/ });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "All Cities" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "All Cities" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
