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
  const email = `e2e-keyboard-visitor-${Date.now()}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: { email, password: PASSWORD, fullName: "E2E Keyboard Visitor", userType: "visitor" },
  });
  expect(response.status(), `visitor signup failed: ${await response.text()}`).toBe(201);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

async function auditKeyboardFocus(page: Page, route: string, heading: string) {
  await page.goto(route);
  await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();

  const focusableStops: Array<{ tag: string; name: string; focusVisible: boolean; visible: boolean }> = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const name =
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.innerText?.trim() ||
        element.getAttribute("name") ||
        element.tagName.toLowerCase();
      return {
        tag: element.tagName.toLowerCase(),
        name: name.slice(0, 100),
        focusVisible: element.matches(":focus-visible"),
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none",
        disabled: "disabled" in element && Boolean((element as HTMLButtonElement).disabled),
      };
    });
    expect(stop, `${route}: Tab ${index + 1} should move focus to a real element`).not.toBeNull();
    expect(stop!.visible, `${route}: focused element should be visible (Tab ${index + 1}: ${stop!.name})`).toBe(true);
    expect(stop!.disabled, `${route}: disabled controls must not receive keyboard focus (Tab ${index + 1}: ${stop!.name})`).toBe(false);
    expect(stop!.focusVisible, `${route}: keyboard focus indicator should be active (Tab ${index + 1}: ${stop!.name})`).toBe(true);
    focusableStops.push({ tag: stop!.tag, name: stop!.name, focusVisible: stop!.focusVisible, visible: stop!.visible });
  }

  expect(focusableStops.length).toBe(12);
  expect(new Set(focusableStops.map((stop) => `${stop.tag}:${stop.name}`)).size).toBeGreaterThan(1);
}

test.describe("Authenticated dashboard keyboard accessibility smoke audit", () => {
  test("organizer dashboard exposes visible keyboard focus", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await auditKeyboardFocus(page, "/organizer", "Organizer Dashboard");
  });

  test("exhibitor dashboard exposes visible keyboard focus", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await auditKeyboardFocus(page, "/exhibitor-dashboard", "Exhibitor Dashboard");
  });

  test("visitor ticket page exposes visible keyboard focus", async ({ page }) => {
    await createVisitorSession(page);
    await auditKeyboardFocus(page, "/my-tickets", "My Tickets");
  });

  test("platform admin dashboard exposes visible keyboard focus", async ({ page }) => {
    await loginAs(page, "platform.admin@eventpass.test");
    await auditKeyboardFocus(page, "/platform", "Platform Dashboard");
  });

  test("organizer event creation exposes visible keyboard focus", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await auditKeyboardFocus(page, "/organizer/events/new", "Create Event");
  });

  test("organizer team permissions page exposes visible keyboard focus", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await auditKeyboardFocus(page, "/organizer/team", "Team");
  });

  test("organizer settings page exposes visible keyboard focus", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await auditKeyboardFocus(page, "/organizer/settings", "Settings");
  });

  test("exhibitor lead management page exposes visible keyboard focus", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await auditKeyboardFocus(page, "/exhibitor-dashboard/leads", "Leads");
  });

  test("platform event categories page exposes visible keyboard focus", async ({ page }) => {
    await loginAs(page, "platform.admin@eventpass.test");
    await auditKeyboardFocus(page, "/platform/event-categories", "Event Categories");
  });
});
