import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const EXHIBITOR_EMAIL = "biz1.owner@eventpass.test";

async function login(page: Page, email = EXHIBITOR_EMAIL) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.status(), `login failed: ${await response.text()}`).toBe(200);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  return payload.token as string;
}

test.describe("Exhibitor exhibition discovery", () => {
  test("lists only eligible exhibitions and opens the in-dashboard detail page", async ({ page }) => {
    const token = await login(page);
    const response = await page.request.get("/api/public/events?eventType=EXHIBITION&exhibitorEligible=true&limit=50");
    expect(response.status(), await response.text()).toBe(200);

    const payload = await response.json();
    expect(payload.events.length, "CI seed must contain at least one exhibitor-eligible exhibition").toBeGreaterThan(0);
    expect(payload.events.every((event: { eventType: string; exhibition: { id: string } | null }) =>
      event.eventType === "EXHIBITION" && Boolean(event.exhibition?.id)
    )).toBe(true);

    const exhibition = payload.events[0] as { id: string; title: string; exhibition: { id: string } };
    await page.addInitScript((authToken) => localStorage.setItem("eventpass_token", authToken), token);

    await page.goto("/exhibitor-dashboard/discover");
    await expect(page.getByRole("heading", { name: "Discover Events" })).toBeVisible();
    const discoverHeading = page.getByRole("heading", { name: "Discover Exhibitions" });
    const mainBox = await page.locator("#dashboard-main-content").boundingBox();
    const discoverRoot = discoverHeading.locator("xpath=ancestor::div[contains(@class, 'w-full') and contains(@class, 'space-y-6')][1]");
    const discoverBox = await discoverRoot.boundingBox();
    expect(mainBox).not.toBeNull();
    expect(discoverBox).not.toBeNull();
    expect(discoverBox!.width).toBeGreaterThan(mainBox!.width * 0.8);

    const exhibitionLink = page.getByRole("link", { name: exhibition.title, exact: true });
    await expect(exhibitionLink).toBeVisible();
    await exhibitionLink.click();

    await expect(page.getByRole("heading", { name: exhibition.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Discover" })).toBeVisible();
    await expect(page.locator("#dashboard-main-content").getByRole("link", { name: "My Participations", exact: true })).toBeVisible();
  });

  test("standalone Event application can be submitted, reviewed, viewed by staff, and withdrawn", async ({ page, browser }) => {
    const exhibitorToken = await login(page);
    await page.addInitScript(({ token, businessId }) => {
      localStorage.setItem("eventpass_token", token);
      localStorage.setItem("exhibittix_active_exhibitor_business_id", businessId);
    }, { token: exhibitorToken, businessId: "seed-exhibitor-biz-1" });

    await page.goto("/exhibitor-dashboard/discover");
    await expect(page.getByRole("heading", { name: "Discover Events" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search events" }).fill("E2E Standalone Exhibitor Event 2026");
    await page.getByRole("button", { name: "Search" }).click();
    const eventLink = page.getByRole("link", { name: "E2E Standalone Exhibitor Event 2026", exact: true }).first();
    await expect(eventLink).toBeVisible();
    await eventLink.click();

    await expect(page.getByRole("heading", { name: "E2E Standalone Exhibitor Event 2026", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply to Exhibit" })).toBeEnabled();
    await page.getByRole("button", { name: "Apply to Exhibit" }).click();
    await expect(page).toHaveURL(/event-applications$/);
    await expect(page.getByRole("heading", { name: "Event Applications", exact: true })).toBeVisible();
    await expect(page.getByText("APPLIED", { exact: true })).toBeVisible();

    const organizerContext = await browser.newContext({ baseURL: "http://127.0.0.1:8080" });
    try {
      const organizerPage = await organizerContext.newPage();
      const organizerToken = await login(organizerPage, "org1.owner@eventpass.test");
      await organizerPage.addInitScript((token) => localStorage.setItem("eventpass_token", token), organizerToken);
      await organizerPage.goto("/organizer/events/e2e-exhibitor-applications-event-001/exhibitor-applications");
      await expect(organizerPage.getByRole("heading", { name: "E2E Standalone Exhibitor Event 2026 · Exhibitor applications" })).toBeVisible();
      await expect(organizerPage.getByRole("link", { name: "Exhibitor applications" })).toBeVisible();
      await organizerPage.getByRole("textbox", { name: "Review note" }).fill("Approved by the organizer E2E flow.");
      await organizerPage.getByRole("button", { name: "Approve" }).click();
      await expect(organizerPage.getByText("CONFIRMED", { exact: true })).toBeVisible();

      const staffContext = await browser.newContext({ baseURL: "http://127.0.0.1:8080" });
      try {
        const staffPage = await staffContext.newPage();
        const staffToken = await login(staffPage, "biz1.staff@eventpass.test");
        await staffPage.addInitScript(({ token, businessId }) => {
          localStorage.setItem("eventpass_token", token);
          localStorage.setItem("exhibittix_active_exhibitor_business_id", businessId);
        }, { token: staffToken, businessId: "seed-exhibitor-biz-1" });
        await staffPage.goto("/exhibitor-dashboard/event-applications");
        await expect(staffPage.getByText("CONFIRMED", { exact: true })).toBeVisible();
        await expect(staffPage.getByRole("button", { name: "Withdraw" })).toHaveCount(0);
      } finally {
        await staffContext.close();
      }

      await page.reload();
      await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Withdraw" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page.getByRole("button", { name: "Confirm withdrawal" }).click();
      await expect(page.getByText("WITHDRAWN", { exact: true })).toBeVisible();

      await organizerPage.reload();
      await expect(organizerPage.getByText("WITHDRAWN", { exact: true })).toBeVisible();
    } finally {
      await organizerContext.close();
    }
  });

});
