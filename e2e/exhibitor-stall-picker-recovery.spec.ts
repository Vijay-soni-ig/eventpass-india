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

  test("sales ledger excludes unpaid attempts and subtracts partial refunds", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");

    await page.route("**/api/exhibitor/participations/payments", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: {
            currency: "INR",
            grossPaid: 10000,
            refundedAmount: 500,
            netSpend: 9500,
            pendingAmount: 5000,
            paidBookingCount: 2,
            pendingBookingCount: 1,
            failedBookingCount: 1,
            refundedBookingCount: 1,
          },
          bookings: [
            {
              id: "sales-created",
              amountPaid: "5000",
              paymentStatus: "created",
              createdAt: "2026-11-15T10:00:00.000Z",
              payment: { id: "pay-created", amount: "5000", currency: "INR", status: "created", refundedAmount: "0" },
              exhibition: { name: "Pending Expo" },
              stall: { code: "P-01" },
            },
            {
              id: "sales-paid",
              amountPaid: "8000",
              paymentStatus: "paid",
              createdAt: "2026-11-14T10:00:00.000Z",
              payment: { id: "pay-paid", amount: "8000", currency: "INR", status: "paid", refundedAmount: "0" },
              exhibition: { name: "Paid Expo" },
              stall: { code: "A-01" },
            },
            {
              id: "sales-partial",
              amountPaid: "2000",
              paymentStatus: "partially_refunded",
              createdAt: "2026-11-13T10:00:00.000Z",
              payment: { id: "pay-partial", amount: "2000", currency: "INR", status: "partially_refunded", refundedAmount: "500" },
              exhibition: { name: "Partial Refund Expo" },
              stall: { code: "B-01" },
            },
            {
              id: "sales-failed",
              amountPaid: "3000",
              paymentStatus: "failed",
              createdAt: "2026-11-12T10:00:00.000Z",
              payment: { id: "pay-failed", amount: "3000", currency: "INR", status: "failed", refundedAmount: "0" },
              exhibition: { name: "Failed Expo" },
              stall: { code: "F-01" },
            },
          ],
        }),
      });
    });

    await page.goto("/exhibitor-dashboard/sales");
    await expect(page.getByRole("heading", { name: "Sales", exact: true })).toBeVisible();
    await expect(page.getByText("Gross Paid")).toBeVisible();
    await expect(page.getByText("Net Stall Spend")).toBeVisible();
    await expect(page.getByText("₹10,000")).toBeVisible();
    await expect(page.getByText("₹9,500")).toBeVisible();
    await expect(page.getByText("₹500", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("₹5,000", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pending Expo")).toBeVisible();
    await expect(page.getByText("(not collected)")).toHaveCount(2);
    await expect(page.getByText("Failed Expo")).toBeVisible();
    await expect(page.getByText("failed", { exact: true })).toBeVisible();
  });
  test("staff dashboard remains available without requesting finance-only stall payments", async ({ page }) => {
    await loginAs(page, "biz1.staff@eventpass.test");
    let paymentReads = 0;
    await page.route("**/api/exhibitor/participations/payments", async (route) => {
      paymentReads += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Exhibitor payment access is restricted to owners and admins" }),
      });
    });

    await page.goto("/exhibitor-dashboard");
    await expect(page.getByText("Net Stall Spend")).toBeVisible();
    await expect(page.getByText("Restricted", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirmed Exhibitions")).toBeVisible();
    await expect(page.getByText("Could not load your exhibitor dashboard. Your data has not been changed.")).toHaveCount(0);
    expect(paymentReads).toBe(0);
  });


  test("stall CSV export neutralizes formula-like values and preserves CSV quoting", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");

    await page.route("**/api/exhibitor/participations", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          participations: [{
            id: "csv-export-participation",
            exhibitionId: "csv-export-exhibition",
            status: "confirmed",
            stalls: [{
              id: "csv-export-stall",
              code: "A-01",
              stallType: "\\t=1+1",
              size: '3x3, "premium"',
              price: "5000",
              status: "confirmed",
            }],
            exhibition: {
              id: "csv-export-exhibition",
              name: '=HYPERLINK("https://attacker.example")',
              city: "Ahmedabad",
            },
          }],
        }),
      });
    });

    await page.goto("/exhibitor-dashboard/stalls");
    await expect(page.getByRole("heading", { name: "Stalls", exact: true })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    let csv = "";
    for await (const chunk of stream!) csv += String(chunk);

    expect(csv).toContain("\\"'=HYPERLINK(\\"\\"https://attacker.example\\"\\")\\"");
    expect(csv).toContain("\\"'\\t=1+1\\"");
    expect(csv).toContain('3x3, \\"premium\\"');
    expect(download.suggestedFilename()).toBe("exhibittix-stalls.csv");
  });

});
