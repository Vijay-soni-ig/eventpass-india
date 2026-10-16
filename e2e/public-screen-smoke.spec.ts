import { test, expect, type Page } from "@playwright/test";

/**
 * Broad public-screen smoke coverage. This is intentionally a render contract,
 * not a substitute for feature-specific interaction tests.
 *
 * Keep this list to stable public routes. Dynamic and authenticated routes are
 * covered by their persona/workflow specs so this test does not hide auth bugs.
 */
const PUBLIC_ROUTES = [
  "/",
  "/events",
  "/exhibitions",
  "/discover",
  "/exhibitors",
  "/organizers",
  "/organizer-demo",
  "/pricing",
  "/about",
  "/contact",
  "/help",
  "/how-booking-works",
  "/how-exhibitions-work",
  "/refund-policy",
  "/terms",
  "/privacy",
];


async function createVisitorSession(page: Page) {
  const email = `e2e-route-loading-${Date.now()}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: "DevPassword123!",
      fullName: "E2E Route Loading Visitor",
      userType: "visitor",
    },
  });
  expect(response.status(), `visitor signup failed: ${await response.text()}`).toBe(201);
  const payload = await response.json() as { token: string };
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

async function delayLazyModule(page: Page, modulePath: string) {
  await page.route(`**/${modulePath}*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
}

test.describe("Public screen smoke audit", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders without an uncaught browser exception`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(route);
      expect(response, `${route} should return a document response`).not.toBeNull();
      expect(response!.status(), `${route} should not return an HTTP error`).toBeLessThan(400);

      // Wait for React to render a meaningful application surface.
      await expect(page.locator("body")).not.toBeEmpty();
      await expect(page.locator("header, main, [role='main']").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);

      expect(pageErrors, `${route} raised uncaught browser exceptions`).toEqual([]);
    });
  }

  test("public screens remain within a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    for (const route of ["/", "/events", "/organizers", "/pricing", "/contact"]) {
      await page.goto(route);
      await expect(page.locator("header, main, [role='main']").first()).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));

      expect(
        dimensions.documentWidth,
        `${route} should not create horizontal page overflow on mobile`,
      ).toBeLessThanOrEqual(dimensions.viewportWidth);
    }
  });

  test("public lazy route announces loading while its module is delayed", async ({ page }) => {
    await delayLazyModule(page, "src/pages/Pricing.tsx");
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });

  test("authenticated lazy route announces loading while its module is delayed", async ({ page }) => {
    await createVisitorSession(page);
    await delayLazyModule(page, "src/pages/MyTickets.tsx");
    await page.goto("/my-tickets", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("organizer lazy route announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "org1.owner@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `organizer login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/organizer/registrations/Registrations.tsx");
    await page.goto("/organizer/registrations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { name: "Registrations", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("exhibitor lazy route announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "biz1.owner@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `exhibitor login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/exhibitor/participations/MyParticipations.tsx");
    await page.goto("/exhibitor-dashboard/participations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { name: "My Participations", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("platform admin lazy route announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "platform.admin@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `platform admin login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/platform/EventCategories.tsx");
    await page.goto("/platform/event-categories", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { name: "Event Categories", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("organizer events list announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "org1.owner@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `organizer login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/organizer/events/EventsList.tsx");
    await page.goto("/organizer/events", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("exhibitor dashboard announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "biz1.owner@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `exhibitor login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/exhibitor/Dashboard.tsx");
    await page.goto("/exhibitor-dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { name: "Confirmed Exhibitions", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("platform dashboard announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "platform.admin@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `platform admin login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/platform/Dashboard.tsx");
    await page.goto("/platform", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { name: "Platform Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });


  test("universal event overview announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "org1.owner@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `organizer login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/organizer/events/UniversalEventOverview.tsx");
    await page.goto("/organizer/events/e2e-public-event-001", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("universal event participants announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "org1.owner@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `organizer login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/organizer/events/UniversalEventParticipants.tsx");
    await page.goto("/organizer/events/e2e-public-event-001/participants", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { level: 1, name: /Participants$/ })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("universal event tickets announces loading while its module is delayed", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: "org1.owner@eventpass.test", password: "DevPassword123!" },
    });
    expect(login.status(), `organizer login failed: ${await login.text()}`).toBe(200);
    const payload = await login.json() as { token: string };
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);

    await delayLazyModule(page, "src/pages/organizer/events/UniversalEventTickets.tsx");
    await page.goto("/organizer/events/e2e-public-event-001/tickets", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toHaveText("Loading page…");
    await expect(page.getByRole("heading", { name: "Tickets", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });


  test("public event detail announces ticket catalog failure and recovers on retry", async ({ page }) => {
    let requests = 0;
    let allowRecovery = false;
    await page.route("**/api/public/events/e2e-public-event-001/tickets", async (route) => {
      requests += 1;
      if (!allowRecovery) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected public ticket catalog failure" }) });
        return;
      }
      await route.continue();
    });

    await page.goto("/event/e2e-public-event-001");
    await expect(page.getByRole("heading", { name: "E2E Public Conference 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tickets temporarily unavailable" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).toContainText("We couldn’t load ticket availability");
    await expect(page.getByText("Ticket sales are not available yet.")).toHaveCount(0);

    const failedRequests = requests;
    allowRecovery = true;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => requests, { timeout: 10_000 }).toBeGreaterThan(failedRequests);
    await expect(page.getByRole("heading", { name: "Tickets temporarily unavailable" })).toHaveCount(0);
    await expect(page.getByText("E2E Free Visitor Pass", { exact: true })).toBeVisible();
  });

  test("public event detail announces participant catalog failure and recovers on retry", async ({ page }) => {
    // This seeded event keeps participant modules disabled by default. Enable the public
    // module in the response for this isolated UI failure test without mutating shared seed data.
    await page.route("**/api/public/events/e2e-public-event-001", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.event.moduleEnablements.push({ moduleType: "PARTICIPANTS" });
      await route.fulfill({ response, json: body });
    });
    let requests = 0;
    let allowRecovery = false;
    await page.route("**/api/public/events/e2e-public-event-001/participants**", async (route) => {
      requests += 1;
      if (!allowRecovery) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected public participant catalog failure" }) });
        return;
      }
      // The seeded database intentionally has this module disabled. Mock a successful
      // empty catalog after retry so this test isolates the public UI empty-state contract.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ participants: [], total: 0, page: 1, pageSize: 20, hasNextPage: false }),
      });
    });

    await page.goto("/event/e2e-public-event-001");
    await expect(page.getByRole("heading", { name: "E2E Public Conference 2026" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Participants temporarily unavailable" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).toContainText("We couldn’t load event participants");

    const failedRequests = requests;
    allowRecovery = true;
    await page.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => requests, { timeout: 10_000 }).toBeGreaterThan(failedRequests);
    await expect(page.getByRole("heading", { name: "Participants temporarily unavailable" })).toHaveCount(0);
    await expect(page.getByText("No participants have been announced yet.", { exact: true })).toBeVisible();
  });

});
