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

test.describe("Exhibitor event discovery", () => {
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
    const discoverHeading = page.getByRole("heading", { name: "Discover Events" });
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
    const eventId = "e2e-exhibitor-applications-event-001";
    const eventTitle = "E2E Standalone Exhibitor Event 2026";
    const businessId = "seed-exhibitor-biz-1";
    type ApplicationStatus = "APPLIED" | "CONFIRMED" | "REJECTED" | "WITHDRAWN";

    const exhibitorToken = await login(page);
    const exhibitorHeaders = { Authorization: `Bearer ${exhibitorToken}` };
    await page.addInitScript(({ token, selectedBusinessId }) => {
      localStorage.setItem("eventpass_token", token);
      localStorage.setItem("exhibittix_active_exhibitor_business_id", selectedBusinessId);
    }, { token: exhibitorToken, selectedBusinessId: businessId });

    const readApplication = async () => {
      const response = await page.request.get("/api/event-exhibitor-participations/mine", {
        headers: exhibitorHeaders,
      });
      expect(response.status(), `could not read existing Event applications: ${await response.text()}`).toBe(200);
      const body = await response.json() as {
        participations: Array<{ eventId: string; exhibitorBusinessId: string; status: ApplicationStatus }>;
      };
      return body.participations.find((item) => item.eventId === eventId && item.exhibitorBusinessId === businessId) ?? null;
    };
    const eventApplicationCard = (targetPage: Page) => targetPage
      .getByRole("heading", { name: eventTitle, exact: true })
      .locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");

    let application = await readApplication();
    let status: ApplicationStatus | null = application?.status ?? null;
    expect(status === "REJECTED", "the deterministic application fixture must not start rejected").toBe(false);

    await page.goto("/exhibitor-dashboard/discover");
    await expect(page.getByRole("heading", { name: "Discover Events" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search events" }).fill(eventTitle);
    await page.getByRole("button", { name: "Search" }).click();
    const eventLink = page.getByRole("link", { name: eventTitle, exact: true }).first();
    await expect(eventLink).toBeVisible();
    await eventLink.click();
    await expect(page.getByRole("heading", { name: eventTitle, exact: true })).toBeVisible();

    if (!status) {
      await expect(page.getByRole("button", { name: "Apply to Exhibit" })).toBeEnabled();
      await page.getByRole("button", { name: "Apply to Exhibit" }).click();
      await expect(page).toHaveURL(/event-applications$/);
      await expect(page.getByRole("heading", { name: "Event Applications", exact: true })).toBeVisible();
      await expect(eventApplicationCard(page).getByText("APPLIED", { exact: true })).toBeVisible();
      application = await readApplication();
      expect(application, "the application must be persisted for the selected Event/business pair").not.toBeNull();
      status = application!.status;
    } else {
      expect(["APPLIED", "CONFIRMED", "WITHDRAWN"]).toContain(status);
      await expect(page.getByRole("link", { name: "View application status" })).toBeVisible();
      await page.getByRole("link", { name: "View application status" }).click();
      await expect(page).toHaveURL(/event-applications$/);
      await expect(eventApplicationCard(page).getByText(status, { exact: true })).toBeVisible();
    }

    const organizerContext = await browser.newContext({ baseURL: "http://127.0.0.1:8080" });
    try {
      const organizerPage = await organizerContext.newPage();
      const organizerToken = await login(organizerPage, "org1.owner@eventpass.test");
      await organizerPage.addInitScript((token) => localStorage.setItem("eventpass_token", token), organizerToken);
      await organizerPage.goto(`/organizer/events/${eventId}/exhibitor-applications`);
      await expect(organizerPage.getByRole("heading", { name: `${eventTitle} · Exhibitor applications` })).toBeVisible();
      await expect(organizerPage.getByRole("link", { name: "Exhibitor applications" })).toBeVisible();

      if (status === "APPLIED") {
        await organizerPage.getByRole("textbox", { name: "Review note" }).fill("Approved by the organizer E2E flow.");
        await organizerPage.getByRole("button", { name: "Approve" }).click();
        await expect(organizerPage.getByText("CONFIRMED", { exact: true })).toBeVisible();
        status = "CONFIRMED";
      } else {
        await expect(organizerPage.getByText(status, { exact: true })).toBeVisible();
      }

      const staffContext = await browser.newContext({ baseURL: "http://127.0.0.1:8080" });
      try {
        const staffPage = await staffContext.newPage();
        const staffToken = await login(staffPage, "biz1.staff@eventpass.test");
        await staffPage.addInitScript(({ token, selectedBusinessId }) => {
          localStorage.setItem("eventpass_token", token);
          localStorage.setItem("exhibittix_active_exhibitor_business_id", selectedBusinessId);
        }, { token: staffToken, selectedBusinessId: businessId });
        await staffPage.goto("/exhibitor-dashboard/event-applications");
        const staffCard = eventApplicationCard(staffPage);
        await expect(staffCard.getByText(status, { exact: true })).toBeVisible();
        await expect(staffCard.getByRole("button", { name: "Withdraw" })).toHaveCount(0);
      } finally {
        await staffContext.close();
      }

      await page.reload();
      const ownerCard = eventApplicationCard(page);
      await expect(ownerCard.getByText(status, { exact: true })).toBeVisible();
      if (status === "APPLIED" || status === "CONFIRMED") {
        await ownerCard.getByRole("button", { name: "Withdraw" }).click();
        await expect(page.getByRole("alertdialog")).toBeVisible();
        await page.getByRole("button", { name: "Confirm withdrawal" }).click();
        await expect(ownerCard.getByText("WITHDRAWN", { exact: true })).toBeVisible();
        status = "WITHDRAWN";
      } else {
        await expect(ownerCard.getByRole("button", { name: "Withdraw" })).toHaveCount(0);
      }

      await organizerPage.reload();
      await expect(organizerPage.getByText("WITHDRAWN", { exact: true })).toBeVisible();
    } finally {
      await organizerContext.close();
    }
  });

});
