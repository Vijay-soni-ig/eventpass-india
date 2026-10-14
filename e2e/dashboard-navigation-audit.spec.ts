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
  return payload.token as string;
}

/**
 * Audits the navigation contract for each primary dashboard persona.
 * This checks that visible sidebar destinations render and do not redirect
 * to a 404 or access-denied surface. Feature-specific specs cover mutations.
 */
async function auditVisibleSidebarLinks(page: Page, homePath: string) {
  await page.goto(homePath);
  const nav = page.locator("aside nav");
  await expect(nav).toBeVisible();

  const links = await nav.getByRole("link").evaluateAll((elements) =>
    elements
      .map((element) => ({
        label: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
        href: element.getAttribute("href") ?? "",
      }))
      .filter((item) => item.href.startsWith("/")),
  );

  expect(links.length, `${homePath} should expose dashboard navigation links`).toBeGreaterThan(1);

  for (const { label, href } of links) {
    await test.step(`${homePath}: ${label || href} -> ${href}`, async () => {
      await page.goto(href);
      await expect(page.locator("header, aside").first(), `${href} should render the dashboard shell`).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByRole("heading", { name: "404", exact: true }), `${href} should not render 404`).toHaveCount(0);
      await expect(page.getByText("Access Denied", { exact: true }), `${href} should not deny the owning persona`).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\?.*)?$"));
    });
  }
}

test.describe("Dashboard sidebar navigation audit", () => {
  test("organizer owner can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await auditVisibleSidebarLinks(page, "/organizer");
  });

  test("stale organizer context requires explicit workspace selection when multiple dashboards are accessible", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    let dashboardCreateRequests = 0;
    let dashboardDataRequests = 0;

    await page.route("**/api/auth/me", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.user.roles.organizer = [
        { organizerId: "stale-organizer-id", name: "Stale organizer context", role: "ORGANIZER_OWNER" },
        { organizerId: ownerB, name: "Beta Organizer", role: "ORGANIZER_OWNER" },
      ];
      await route.fulfill({ response, json: payload });
    });

    await page.route("**/api/dashboards**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (route.request().method() === "POST" && requestUrl.pathname === "/api/dashboards") {
        dashboardCreateRequests += 1;
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ dashboard: {} }) });
        return;
      }
      if (route.request().method() !== "GET") return route.continue();
      if (requestUrl.pathname === "/api/dashboards") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ dashboards: [
            { id: "dashboard-alpha", ownerType: "ORGANIZER", ownerId: ownerA, name: "Alpha Workspace", isDefault: true, version: 1, archivedAt: null, widgets: [] },
            { id: "dashboard-beta", ownerType: "ORGANIZER", ownerId: ownerB, name: "Beta Workspace", isDefault: true, version: 1, archivedAt: null, widgets: [] },
          ] }),
        });
        return;
      }
      if (requestUrl.pathname.endsWith("/data")) {
        dashboardDataRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            dashboardId: requestUrl.pathname.split("/")[3],
            version: 1,
            generatedAt: new Date().toISOString(),
            filters: { from: "2026-09-14T00:00:00.000Z", to: "2026-10-13T23:59:59.999Z" },
            widgets: [],
          }),
        });
        return;
      }
      await route.continue();
    });

    // Intercept the nested dashboard-data URL explicitly. The collection route above
    // covers dashboard listing/creation; this exact route keeps the fake dashboard IDs
    // out of the real API and makes the post-selection request deterministic.
    await page.route("**/api/dashboards/*/data**", async (route) => {
      dashboardDataRequests += 1;
      const requestUrl = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          dashboardId: requestUrl.pathname.split("/")[3],
          version: 1,
          generatedAt: new Date().toISOString(),
          filters: { from: "2026-09-14T00:00:00.000Z", to: "2026-10-13T23:59:59.999Z" },
          widgets: [],
        }),
      });
    });

    await page.goto("/organizer");
    await expect(page.getByRole("heading", { name: "Choose an organizer workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Alpha Workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Beta Organizer" })).toBeVisible();
    expect(dashboardCreateRequests, "an ambiguous owner context must never auto-create a dashboard").toBe(0);
    expect(dashboardDataRequests, "dashboard metrics should not be requested before a workspace is selected").toBe(0);

    await page.getByRole("button", { name: "Beta Organizer" }).click();
    await expect(page.getByRole("heading", { name: "Beta Workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch workspace" })).toBeVisible();
    await expect.poll(() => dashboardDataRequests, { message: "dashboard data should load after the workspace is selected" }).toBe(1);
    expect(dashboardCreateRequests, "selecting an existing workspace must not create another dashboard").toBe(0);

    await page.getByRole("button", { name: "Switch workspace" }).click();
    await expect(page.getByRole("heading", { name: "Choose an organizer workspace" })).toBeVisible();
    expect(dashboardCreateRequests).toBe(0);
  });

  test("organizer dashboard quick actions navigate to their real destinations", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await page.goto("/organizer");
    const quickActions = page.locator('section[aria-labelledby="quick-actions-heading"]');
    await expect(quickActions).toBeVisible();

    const expectedDestinations = [
      { label: "Create Event", path: "/organizer/events/new" },
      { label: "Manage Exhibitors", path: "/organizer/exhibitors" },
      { label: "Manage Tickets", path: "/organizer/tickets" },
      { label: "Check-in Scanner", path: "/organizer/checkin" },
      { label: "Payments", path: "/organizer/payments" },
      // The legacy analytics shortcut intentionally redirects to the canonical event analytics route.
      { label: "Analytics", path: "/organizer/event-analytics" },
    ];

    for (const destination of expectedDestinations) {
      await test.step(`quick action ${destination.label} opens ${destination.path}`, async () => {
        const action = quickActions.getByRole("link", { name: new RegExp(destination.label) });
        await expect(action).toBeVisible();
        await action.click();
        await expect(page).toHaveURL(new RegExp(destination.path + "$"));
        await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
        await expect(page.getByText("Access Denied", { exact: true })).toHaveCount(0);
        await expect(page.locator("aside nav")).toBeVisible();
        await page.goto("/organizer");
        await expect(quickActions).toBeVisible();
      });
    }
  });

  test("organizer shell scrolls in the main content and Manage plan opens Plan & Billing", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/organizer");
    const main = page.locator("#dashboard-main-content");
    const nav = page.locator("aside nav");
    await expect(main).toBeVisible();
    await expect(nav).toBeVisible();

    const scrollContract = await page.evaluate(() => {
      const mainElement = document.querySelector("#dashboard-main-content");
      const navElement = document.querySelector("aside nav");
      const shell = mainElement?.parentElement?.parentElement;
      if (!(mainElement instanceof HTMLElement) || !(navElement instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
        return null;
      }
      return {
        mainOverflowY: getComputedStyle(mainElement).overflowY,
        sidebarNavOverflowY: getComputedStyle(navElement).overflowY,
        shellOverflow: getComputedStyle(shell).overflow,
      };
    });
    expect(scrollContract).toEqual({
      mainOverflowY: "auto",
      sidebarNavOverflowY: "hidden",
      shellOverflow: "hidden",
    });

    const sidebarPlan = page.locator("aside nav").getByRole("link", { name: "Plan & billing" });
    await expect(sidebarPlan).toBeVisible();
    await sidebarPlan.click();
    await expect(page).toHaveURL(new RegExp("/organizer/plan$"));
    await expect(page.getByRole("heading", { name: "Plan & billing" })).toBeVisible();
    const planContent = page.locator("main div.w-full.max-w-none").first();
    await expect(planContent).toBeVisible();
    await expect.poll(() => planContent.evaluate((element) => getComputedStyle(element).maxWidth)).toBe("none");
    await expect(page.getByRole("link", { name: /View plans and pricing/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request an upgrade review" })).toBeVisible();

    await page.goto("/organizer");
    const managePlan = page.getByRole("link", { name: "Manage plan" });
    await expect(managePlan).toBeVisible();
    await managePlan.click();
    await expect(page).toHaveURL(new RegExp("/organizer/plan$"));
    await expect(page.getByRole("heading", { name: "Plan & billing" })).toBeVisible();
  });

  test("exhibitor owner can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await auditVisibleSidebarLinks(page, "/exhibitor-dashboard");
  });

  test("exhibitor dashboard actions open profile, exhibition list, and the correct empty/populated state", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard");
    await expect(page.getByText(/enable payouts/i)).toHaveCount(0);

    const completeProfile = page.getByRole("link", { name: "Complete", exact: true });
    if (await completeProfile.isVisible().catch(() => false)) {
      await completeProfile.click();
      await expect(page).toHaveURL(/\/exhibitor-dashboard\/business\/profile$/);
      await expect(page.locator("aside nav")).toBeVisible();
      await page.goto("/exhibitor-dashboard");
    }

    const viewAll = page.getByRole("link", { name: /View All/ });
    await expect(viewAll).toBeVisible();
    await viewAll.click();
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/exhibitions$/);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
    await expect(page.getByText("Access Denied", { exact: true })).toHaveCount(0);

    await page.goto("/exhibitor-dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Confirmed Exhibitions")).toBeVisible();
    const confirmedRows = page.locator('a[href="/exhibitor-dashboard/participations"]');
    const browse = page.getByRole("link", { name: /Browse Exhibitions/ });
    // Wait for the participation query to settle before deciding whether this is the
    // populated or empty state; do not assume networkidle means React Query has rendered.
    await expect.poll(async () => {
      const rows = await confirmedRows.count();
      const browseVisible = await browse.isVisible().catch(() => false);
      return rows > 0 || browseVisible;
    }, { message: "dashboard should render confirmed participations or its empty-state Browse Exhibitions action" }).toBe(true);

    if (await confirmedRows.count()) {
      await confirmedRows.first().click();
      await expect(page).toHaveURL(/\/exhibitor-dashboard\/participations$/);
      await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
    } else {
      await expect(browse).toBeVisible();
      await browse.click();
      await expect(page).toHaveURL(/\/exhibitions$/);
      await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
    }
  });

  test("company profile validates required fields and Cancel restores unsaved edits", async ({ page }) => {
    const token = await loginAs(page, "biz1.owner@eventpass.test");
    const auth = { Authorization: `Bearer ${token}` };
    const beforeResponse = await page.request.get("/api/business", { headers: auth });
    expect(beforeResponse.status(), await beforeResponse.text()).toBe(200);
    const before = (await beforeResponse.json()).business;
    expect(before).toBeTruthy();

    await page.goto("/exhibitor-dashboard/business/profile");
    await expect(page.getByRole("heading", { name: "Company Profile" })).toBeVisible();

    await page.getByLabel("Company Name *").fill("   ");
    await page.getByLabel("Business Address *").fill("   ");
    await page.getByLabel("GST Number *").fill("");
    await page.getByLabel("PAN Number *").fill("");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText(/Please complete the required fields: Company Name, Business Address, GST Number, PAN Number\./)).toBeVisible();
    await expect(page.getByLabel("Company Name *")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Business Address *")).toHaveAttribute("aria-invalid", "true");

    const afterInvalidResponse = await page.request.get("/api/business", { headers: auth });
    expect(afterInvalidResponse.status()).toBe(200);
    expect((await afterInvalidResponse.json()).business.companyName).toBe(before.companyName);

    await page.getByLabel("Company Name *").fill("Unsaved temporary company name");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Company Name *")).toHaveValue(before.companyName ?? "");
    await expect(page.getByLabel("Company Name *")).not.toHaveAttribute("aria-invalid", "true");
  });

  test("company logo upload rejects unsupported types and files larger than 2MB before sending", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard/business/profile");
    const fileInput = page.getByTestId("company-logo-input");

    await fileInput.setInputFiles({
      name: "not-an-image.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("GIF89a"),
    });
    await expect(page.getByText("Choose a PNG, JPG, or WebP image.")).toBeVisible();

    await fileInput.setInputFiles({
      name: "oversized.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
    await expect(page.getByText("Logo must be 2MB or smaller.")).toBeVisible();
    await expect(page.getByText("Uploading...")).toHaveCount(0);
  });

  test("exhibitor business pages do not promise unavailable payouts", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");

    await page.goto("/exhibitor-dashboard");
    await expect(page.getByText(/enable payouts/i)).toHaveCount(0);
    await expect(page.getByText(/payout processing is not available yet/i)).toHaveCount(0);

    await page.goto("/exhibitor-dashboard/business/profile");
    await expect(page.getByRole("heading", { name: "Company Profile" })).toBeVisible();
    await expect(page.getByText(/enable all features including payouts/i)).toHaveCount(0);
    await expect(page.getByText(/payouts will be processed/i)).toHaveCount(0);
    await expect(page.getByText(/details will be reviewed before payouts begin/i)).toHaveCount(0);
  });

  test("platform admin can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "platform.admin@eventpass.test");
    await auditVisibleSidebarLinks(page, "/platform");
  });
});


test("primary dashboards do not overflow at mobile and tablet widths", async ({ page }) => {
  const assertNoHorizontalOverflow = async (route: string, width: number) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1024 });
    await page.goto(route);
    await expect(page.locator("header:visible, main:visible, aside:visible").first(), `${route} should render at ${width}px`).toBeVisible({ timeout: 60_000 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `${route} has horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);

    await page.keyboard.press("Tab");
    const focusState = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) return null;
      const rect = active.getBoundingClientRect();
      const style = window.getComputedStyle(active);
      return {
        interactive: active.matches('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])'),
        visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden",
        focusIndicator: (style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none",
      };
    });
    expect(focusState?.interactive, `${route} should expose a keyboard-reachable control at ${width}px`).toBe(true);
    expect(focusState?.visible, `${route} keyboard focus should remain visible at ${width}px`).toBe(true);
    expect(focusState?.focusIndicator, `${route} keyboard focus should have a visible indicator at ${width}px`).toBe(true);
  };

  const personas = [
    { email: "org1.owner@eventpass.test", route: "/organizer" },
    { email: "biz1.owner@eventpass.test", route: "/exhibitor-dashboard" },
    { email: "platform.admin@eventpass.test", route: "/platform" },
  ];

  for (const persona of personas) {
    await loginAs(page, persona.email);
    await assertNoHorizontalOverflow(persona.route, 375);
    await assertNoHorizontalOverflow(persona.route, 768);
  }

  const visitorEmail = `e2e-responsive-visitor-${Date.now()}@example.com`;
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: visitorEmail,
      password: PASSWORD,
      fullName: "E2E Responsive Visitor",
      userType: "visitor",
    },
  });
  expect(signup.status(), `visitor signup failed: ${await signup.text()}`).toBe(201);
  const visitor = await signup.json();
  expect(visitor.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), visitor.token);
  await assertNoHorizontalOverflow("/my-tickets", 375);
  await assertNoHorizontalOverflow("/my-tickets", 768);
});
