import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const EXHIBITOR_EMAIL = "biz1.owner@eventpass.test";

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: EXHIBITOR_EMAIL, password: PASSWORD },
  });
  const responseBody = await response.text();
  expect(response.status(), `login failed for ${EXHIBITOR_EMAIL}: ${responseBody}`).toBe(200);
  const payload = JSON.parse(responseBody);
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

test.describe("Exhibitor Analytics", () => {
  test("loads Analytics and shows a valid data or empty state", async ({ page }) => {
    await login(page);
    await page.goto("/exhibitor-dashboard/analytics");

    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Lead and participation performance across your exhibitions")).toBeVisible();

    // The seeded account can legitimately have data or no analytics yet.
    const totalLeads = page.getByText("Total Leads", { exact: true });
    const noAnalytics = page.getByRole("heading", { name: "No analytics yet", exact: true });
    const selectBusiness = page.getByRole("heading", { name: "Select a business to view analytics", exact: true });
    await expect(totalLeads.or(noAnalytics).or(selectBusiness)).toBeVisible({ timeout: 15_000 });
  });

  test("analytics API failure is announced and retry recovers", async ({ page }) => {
    await login(page);
    let analyticsRequests = 0;
    let allowRecovery = false;

    await page.route("**/api/leads/analytics**", async (route) => {
      analyticsRequests += 1;
      if (!allowRecovery) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Injected analytics failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/exhibitor-dashboard/analytics");
    await expect(page.getByRole("alert")).toContainText("Could not load your analytics.", { timeout: 15_000 });
    const failedRequests = analyticsRequests;
    const retry = page.getByRole("button", { name: "Try again", exact: true });
    await expect(retry).toBeVisible();

    allowRecovery = true;
    await retry.click();
    await expect.poll(() => analyticsRequests, { timeout: 10_000 }).toBeGreaterThan(failedRequests);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  });
});
