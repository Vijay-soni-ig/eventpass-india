import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

type ControlIssue = { tag: string; text: string; reason: string; href?: string };

async function signInWithSeededAccount(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.ok(), `login failed for ${email}: ${await response.text()}`).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

async function createCompletedOrganizerSession(page: Page) {
  const email = `e2e-dashboard-reset-${Date.now()}@example.com`;
  const signup = await page.request.post("/api/auth/signup", {
    data: { email, password: PASSWORD, fullName: "E2E Dashboard Reset Organizer", userType: "organizer" },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const payload = await signup.json() as {
    token: string;
    user: { roles: { organizer: Array<{ organizerId: string }> } };
  };
  expect(payload.token).toBeTruthy();
  const organizerId = payload.user.roles.organizer[0]?.organizerId;
  expect(organizerId, "new organizer signup must create an organizer membership").toBeTruthy();

  // Provision the dashboard explicitly before visiting /organizer. This avoids
  // racing the component's automatic first-dashboard creation against this test.
  const dashboardResponse = await page.request.post("/api/dashboards", {
    headers: { Authorization: `Bearer ${payload.token}` },
    data: {
      ownerType: "ORGANIZER",
      ownerId: organizerId,
      name: "E2E Dashboard Reset",
      isDefault: true,
      widgets: [{ widgetType: "ORGANIZER_EVENT_KPI", x: 0, y: 0, width: 3, height: 2 }],
    },
  });
  expect(dashboardResponse.status(), await dashboardResponse.text()).toBe(201);

  await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), payload.token);
  await page.goto("/onboarding");

  await expect(page.getByRole("heading", { level: 2, name: "Organization profile" })).toBeVisible();
  await page.getByLabel("Organization name *").fill("E2E Dashboard Reset LLP");
  await page.getByLabel("Business type *").click();
  await page.getByRole("option", { name: "LLP" }).click();
  await page.getByLabel("Country *").click();
  await page.getByRole("option", { name: "India" }).click();
  await page.getByLabel("Business address *").fill("12 Ashram Road, Navrangpura, Ahmedabad 380009");
  await page.getByLabel("City *").fill("Ahmedabad");
  await page.getByLabel("State / Province *").click();
  await page.getByRole("option", { name: "Gujarat" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Organization branding" })).toBeVisible();
  await page.getByLabel("About your organization *").fill("We organize professional events and exhibitions.");
  await page.getByLabel("Website").fill("https://example.com");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "About your events" })).toBeVisible();
  await page.getByRole("button", { name: "Google" }).click();
  await page.getByRole("button", { name: "Monthly" }).click();
  await page.getByRole("button", { name: "101–500 people" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { level: 2, name: "Create your organizer page" })).toBeVisible();
  await page.getByLabel("Organizer page URL *").fill(`e2e-dashboard-reset-${Date.now()}`);
  await page.getByLabel("Public email").fill(email);
  await page.getByRole("button", { name: "Save organizer page" }).click();
  await expect(page).toHaveURL(/\/organizer$/);
  await expect(page.getByRole("heading", { name: "Organizer Dashboard" })).toBeVisible();
}

async function createVisitorSession(page: Page) {
  const email = `e2e-dashboard-contract-${Date.now()}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: PASSWORD,
      fullName: "E2E Dashboard Contract Visitor",
      userType: "visitor",
    },
  });
  expect(response.status(), `visitor signup failed: ${await response.text()}`).toBe(201);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

async function inspectDashboardAffordances(page: Page, route: string) {
  const issues = await page.evaluate(() => {
    const findings: ControlIssue[] = [];
    const textOf = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100);

    const hasName = (element: Element) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy
        ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim()
        : "";
      return Boolean(
        element.getAttribute("aria-label")?.trim() ||
        labelledText ||
        element.getAttribute("title")?.trim() ||
        textOf(element) ||
        Array.from(element.querySelectorAll("img")).some((img) => Boolean(img.getAttribute("alt")?.trim()))
      );
    };

    document.querySelectorAll("button, a, input, select, textarea").forEach((element) => {
      if (!(element instanceof HTMLElement) || element.hidden || element.getAttribute("aria-hidden") === "true") return;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;

      const tag = element.tagName.toLowerCase();
      const text = textOf(element);
      if ((tag === "button" || tag === "a") && !hasName(element)) {
        findings.push({ tag, text, reason: "Interactive control has no accessible name" });
      }

      if (tag === "a") {
        const href = element.getAttribute("href")?.trim() ?? "";
        if (!href) findings.push({ tag, text, reason: "Link has no destination" });
        else if (/^javascript:/i.test(href)) findings.push({ tag, text, href, reason: "JavaScript URL used as a link destination" });
        else if (href === "#") findings.push({ tag, text, href, reason: "Placeholder link does not navigate" });
        else if (href.startsWith("#") && href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))) {
          findings.push({ tag, text, href, reason: "In-page link target does not exist" });
        }
      }

      if (["input", "select", "textarea"].includes(tag)) {
        const input = element as HTMLInputElement;
        if (input.type === "hidden" || input.disabled) return;
        const id = input.id;
        const labelled = Boolean(
          input.getAttribute("aria-label")?.trim() ||
          input.getAttribute("aria-labelledby")?.trim() ||
          (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
          input.closest("label") ||
          input.getAttribute("title")?.trim()
        );
        if (!labelled) findings.push({ tag, text: input.name || input.type || tag, reason: "Form control has no programmatic label" });
      }
    });

    return findings;
  });

  expect(
    issues,
    `${route} has broken dashboard affordances:\n${issues.map((issue) => `${issue.tag} "${issue.text}" — ${issue.reason}${issue.href ? ` (${issue.href})` : ""}`).join("\n")}`,
  ).toEqual([]);
}

test.describe("Authenticated dashboard interactive affordance contract", () => {
  test("organizer dashboard controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "org1.owner@eventpass.test");
    await page.goto("/organizer");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/organizer");
  });

  test("visitor My Tickets controls are named and links are not placeholders", async ({ page }) => {
    await createVisitorSession(page);
    await page.goto("/my-tickets");
    await expect(page.getByRole("heading", { name: "My Tickets", exact: true })).toBeVisible();
    await inspectDashboardAffordances(page, "/my-tickets");
  });

  test("organizer dashboard reset reports completion", async ({ page }) => {
    await createCompletedOrganizerSession(page);
    await expect(page.getByRole("button", { name: "Customize" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Customize" }).click();
    const resetButton = page.getByRole("button", { name: "Reset layout" });
    await expect(resetButton).toBeVisible();
    await resetButton.click();
    await expect(page.getByText("Dashboard layout reset")).toBeVisible({ timeout: 30000 });
  });

  test("exhibitor dashboard controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/exhibitor-dashboard");
  });

  test("platform admin dashboard controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "platform.admin@eventpass.test");
    await page.goto("/platform");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/platform");
  });

  test("visitor ticket dashboard controls are named and links are not placeholders", async ({ page }) => {
    await createVisitorSession(page);
    await page.goto("/my-tickets");
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await inspectDashboardAffordances(page, "/my-tickets");
  });
  test("organizer exhibitors page controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "org1.owner@eventpass.test");
    await page.goto("/organizer/exhibitors");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/organizer/exhibitors");
  });

  test("organizer ticket sales page controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "org1.owner@eventpass.test");
    await page.goto("/organizer/tickets");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/organizer/tickets");
  });

  test("organizer team page controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "org1.owner@eventpass.test");
    await page.goto("/organizer/team");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/organizer/team");
  });

  test("platform event categories page controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "platform.admin@eventpass.test");
    await page.goto("/platform/event-categories");
    await expect(page.getByRole("heading", { name: /event categor/i })).toBeVisible();
    await inspectDashboardAffordances(page, "/platform/event-categories");
  });

  test("platform visitors page controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "platform.admin@eventpass.test");
    await page.goto("/platform/visitors");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/platform/visitors");
  });

  test("platform settings page controls are named and links are not placeholders", async ({ page }) => {
    await signInWithSeededAccount(page, "platform.admin@eventpass.test");
    await page.goto("/platform/settings");
    await expect(page.locator("aside nav")).toBeVisible();
    await inspectDashboardAffordances(page, "/platform/settings");
  });


  const additionalCriticalRoutes = [
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/events" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/events/new" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/events/e2e-public-event-001/participants" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/events/e2e-public-event-001/tickets" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/exhibitions/new" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/exhibitions" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/events/e2e-public-event-001" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/events/e2e-public-event-001/edit" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/stalls" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/visitors" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/leads" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/settings" },
    { persona: "exhibitor", email: "biz1.owner@eventpass.test", route: "/exhibitor-dashboard/business/profile" },
    { persona: "exhibitor", email: "biz1.owner@eventpass.test", route: "/exhibitor-dashboard/participations" },
    { persona: "exhibitor", email: "biz1.owner@eventpass.test", route: "/exhibitor-dashboard/leads" },
    { persona: "platform admin", email: "platform.admin@eventpass.test", route: "/platform/organizers" },
    { persona: "platform admin", email: "platform.admin@eventpass.test", route: "/platform/exhibitors" },
    { persona: "platform admin", email: "platform.admin@eventpass.test", route: "/platform/audit-logs" },
    { persona: "platform admin", email: "platform.admin@eventpass.test", route: "/platform/reports" },
    { persona: "platform admin", email: "platform.admin@eventpass.test", route: "/platform/support" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/analytics" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/registrations" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/payments" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/venues" },
    { persona: "organizer", email: "org1.owner@eventpass.test", route: "/organizer/marketing" },
    { persona: "exhibitor", email: "biz1.owner@eventpass.test", route: "/exhibitor-dashboard/settings" },
    { persona: "exhibitor", email: "biz1.owner@eventpass.test", route: "/exhibitor-dashboard/stalls" },
    { persona: "exhibitor", email: "biz1.owner@eventpass.test", route: "/exhibitor-dashboard/tickets" },
    { persona: "exhibitor", email: "biz1.owner@eventpass.test", route: "/exhibitor-dashboard/scanner" },
    { persona: "platform admin", email: "platform.admin@eventpass.test", route: "/platform/payments" },
    { persona: "platform admin", email: "platform.admin@eventpass.test", route: "/platform/subscriptions" },
    { persona: "platform admin", email: "platform.admin@eventpass.test", route: "/platform/exhibitions" },
  ] as const;

  for (const target of additionalCriticalRoutes) {
    test(`${target.persona} critical route ${target.route} has named controls and real links`, async ({ page }) => {
      await signInWithSeededAccount(page, target.email);
      await page.goto(target.route);
      await expect(page.locator("aside nav")).toBeVisible();
      await inspectDashboardAffordances(page, target.route);
    });
  }

});
