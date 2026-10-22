import { test, expect } from "@playwright/test";

const LINKED_EVENT_ID = "e2e-linked-event-001";
test.describe("Visitor registration and ticket checkout keyboard journeys", () => {
  test("visitor can complete event registration using only the keyboard", async ({ page }) => {
    const eventResponse = await page.request.get(`/api/public/events/${LINKED_EVENT_ID}`);
    expect(eventResponse.ok(), await eventResponse.text()).toBeTruthy();
    const payload = await eventResponse.json();
    payload.event.moduleEnablements = [
      ...(payload.event.moduleEnablements ?? []).filter(
        (module: { moduleType: string }) => !["REGISTRATION", "TICKETING"].includes(module.moduleType),
      ),
      { moduleType: "REGISTRATION" },
      { moduleType: "TICKETING" },
    ];

    await page.route(`**/api/public/events/${LINKED_EVENT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });
    await page.route("**/api/registrations", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const submitted = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          registration: {
            id: "e2e-keyboard-registration",
            status: "CONFIRMED",
            fullName: submitted.fullName,
            email: submitted.email,
          },
        }),
      });
    });

    await page.goto(`/event/${LINKED_EVENT_ID}/register`);
    await expect(page.getByRole("heading", { name: "E2E Linked Exhibition Event 2026" })).toBeVisible();

    const fullName = page.getByLabel("Full name");
    const email = page.getByLabel("Email");
    const consent = page.getByLabel(/consent/i);
    const submit = page.getByRole("button", { name: "Complete registration" });

    await fullName.focus();
    await page.keyboard.type("E2E Keyboard Visitor");
    await page.keyboard.press("Tab");
    await expect(email).toBeFocused();
    await page.keyboard.type("e2e-keyboard-visitor@example.com");
    await page.keyboard.press("Tab");
    await expect(consent).toBeFocused();
    await page.keyboard.press("Space");
    await expect(consent).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "You're registered" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue to tickets" })).toBeVisible();
  });

  test("visitor can select a ticket and continue to checkout using the keyboard", async ({ page }) => {
    const response = await page.request.get(`/api/public/events/${LINKED_EVENT_ID}/tickets`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const ticketPayload = await response.json();
    const original = ticketPayload.ticketTypes[0];
    ticketPayload.ticketTypes = [
      original,
      { ...original, id: "e2e-linked-exhibition-ticket-002", name: "E2E Alternate Visitor Pass" },
    ];
    await page.route(`**/api/public/events/${LINKED_EVENT_ID}/tickets`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ticketPayload) });
    });

    await page.goto(`/event/${LINKED_EVENT_ID}/tickets`);
    await expect(page.getByRole("heading", { name: "Get your tickets" })).toBeVisible();
    const ticketChoice = page.getByRole("button", { name: /E2E Alternate Visitor Pass/i });
    await ticketChoice.focus();
    await page.keyboard.press("Enter");

    const continueButton = page.getByRole("button", { name: "Continue", exact: true });
    await expect(continueButton).toBeEnabled();
    await continueButton.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/book\/e2e-linked-exhibition-001\?ticket=e2e-linked-exhibition-ticket-002/);
  });
});
