import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const EXHIBITOR_EMAIL = "biz1.staff@eventpass.test";

async function loginAs(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(response.ok(), `login failed for ${email}: ${await response.text()}`).toBeTruthy();
  const payload = await response.json();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

test.describe("Exhibitor stall picker recovery", () => {
  test("floor-plan failure is recoverable and does not hide the stall-list fallback", async ({ page }) => {
    await loginAs(page, EXHIBITOR_EMAIL);

    await page.route("**/api/exhibitor/participations", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          participations: [{
            id: "seed-participation-approved",
            exhibitionId: "seed-exhibition-1",
            status: "approved",
            boothNumber: null,
            stalls: [],
            exhibition: { id: "seed-exhibition-1", name: "E2E Stall Picker Exhibition", city: "Ahmedabad" },
          }],
        }),
      });
    });

    let floorPlanRequests = 0;
    await page.route("**/api/exhibitor/participations/seed-participation-approved/floor-plans", async (route) => {
      floorPlanRequests += 1;
      // The picker refreshes availability on open as well as on initial query mount.
      if (floorPlanRequests <= 2) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Injected floor-plan failure" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ floorPlans: [] }),
      });
    });

    await page.route("**/api/public/exhibitions/seed-exhibition-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          exhibition: {
            id: "seed-exhibition-1",
            name: "E2E Stall Picker Exhibition",
            city: "Ahmedabad",
            stalls: [{
              id: "available-stall-e2e",
              code: "A-01",
              stallType: "standard",
              size: "3x3",
              price: "5000",
              status: "available",
            }],
          },
        }),
      });
    });

    await page.goto("/exhibitor-dashboard/participations");
    await expect(page.getByRole("heading", { name: "My Participations" })).toBeVisible();
    await page.getByRole("button", { name: "Select Stall" }).click();

    await expect(page.getByRole("heading", { name: "Couldn't load the floor plan" })).toBeVisible();
    await expect(page.getByText("No stalls available")).toHaveCount(0);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Couldn't load the floor plan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /A-01/ })).toBeVisible();
    expect(floorPlanRequests).toBeGreaterThanOrEqual(3);
  });

  test("payment settlement refreshes the exhibitor participation state from the server", async ({ page }) => {
    await loginAs(page, EXHIBITOR_EMAIL);

    let participationReads = 0;
    await page.route("**/api/exhibitor/participations", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      participationReads += 1;
      const status = participationReads === 1 ? "payment_pending" : "confirmed";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          participations: [{
            id: "seed-participation-payment-e2e",
            exhibitionId: "seed-exhibition-1",
            exhibitorBusinessId: "seed-exhibitor-business-1",
            status,
            boothNumber: "A-01",
            stalls: [{ id: "seed-stall-payment-e2e", code: "A-01", price: "5000", status: "reserved" }],
            exhibition: { id: "seed-exhibition-1", name: "E2E Payment State Exhibition", city: "Ahmedabad" },
          }],
        }),
      });
    });

    await page.route("**/api/exhibitor/participations/seed-participation-payment-e2e/payment", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          booking: { id: "booking-payment-e2e" },
          payment: { id: "payment-e2e", amount: "5000", currency: "INR", status: "pending" },
          order: { provider: "mock", providerOrderId: "mock-order-e2e" },
        }),
      });
    });

    await page.route("**/api/payments/payment-e2e/mock-complete", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          payment: { id: "payment-e2e", amount: "5000", currency: "INR", status: "paid" },
        }),
      });
    });

    await page.goto("/exhibitor-dashboard/participations");
    await expect(page.getByRole("heading", { name: "My Participations" })).toBeVisible();
    await expect(page.getByText("Payment in progress — complete it below, or it's awaiting organizer confirmation")).toBeVisible();

    await page.getByRole("button", { name: "Complete Payment" }).click();
    await expect(page.getByRole("heading", { name: "Test Payment Gateway" })).toBeVisible();
    await page.getByRole("button", { name: "Simulate Success" }).click();

    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete Payment" })).toHaveCount(0);
    expect(participationReads).toBeGreaterThanOrEqual(2);
  });

});
