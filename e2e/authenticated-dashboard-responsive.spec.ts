import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function loginAs(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.ok(), `login failed for ${email}: ${await response.text()}`).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

async function createVisitorSession(page: Page) {
  const email = `e2e-responsive-visitor-${Date.now()}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: PASSWORD,
      fullName: "E2E Responsive Visitor",
      userType: "visitor",
    },
  });
  expect(response.status(), `visitor signup failed: ${await response.text()}`).toBe(201);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

async function assertNoViewportOverflow(page: Page, route: string, width: number) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(
    dimensions.documentWidth,
    `${route} overflows horizontally at ${width}px: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(width + 1);
  expect(
    dimensions.bodyWidth,
    `${route} body overflows horizontally at ${width}px: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(width + 1);
}

async function auditAuthenticatedRoute(page: Page, route: string, heading: string) {
  for (const width of [390, 768, 1440]) {
    await test.step(`${route} at ${width}px`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(route);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: /access denied/i })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
      await assertNoViewportOverflow(page, route, width);
    });
  }
}

test.describe("Authenticated dashboard responsive smoke audit", () => {
  test("organizer dashboard fits phone, tablet, and desktop viewports", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await auditAuthenticatedRoute(page, "/organizer", "Organizer Dashboard");
  });

  test("exhibitor dashboard fits phone, tablet, and desktop viewports", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await auditAuthenticatedRoute(page, "/exhibitor-dashboard", "Exhibitor Dashboard");
  });

  test("visitor ticket page fits phone, tablet, and desktop viewports", async ({ page }) => {
    await createVisitorSession(page);
    await auditAuthenticatedRoute(page, "/my-tickets", "My Tickets");
  });

  test("platform admin dashboard fits phone, tablet, and desktop viewports", async ({ page }) => {
    await loginAs(page, "platform.admin@eventpass.test");
    await auditAuthenticatedRoute(page, "/platform", "Platform Dashboard");
  });
});
