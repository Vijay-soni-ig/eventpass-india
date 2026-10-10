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

async function openWorkspaceMenu(page: Page) {
  // At desktop width, the last header button is the workspace account menu.
  await page.locator("header").getByRole("button").last().click();
  return page.getByRole("menu");
}

const personas = [
  {
    name: "organizer",
    email: "org1.owner@eventpass.test",
    home: "/organizer",
    profile: "/organizer/profile",
    settings: "/organizer/settings",
  },
  {
    name: "exhibitor",
    email: "biz1.owner@eventpass.test",
    home: "/exhibitor-dashboard",
    profile: "/exhibitor-dashboard/business/profile",
    settings: "/exhibitor-dashboard/settings",
  },
  {
    name: "platform admin",
    email: "platform.admin@eventpass.test",
    home: "/platform",
    profile: "/platform/settings",
    settings: "/platform/settings",
  },
] as const;

test.describe("Dashboard header account actions", () => {
  for (const persona of personas) {
    test(`${persona.name} profile and settings actions navigate to their own workspace`, async ({ page }) => {
      await loginAs(page, persona.email);
      await page.goto(persona.home);

      let menu = await openWorkspaceMenu(page);
      await menu.getByRole("menuitem", { name: "Profile" }).click();
      await expect(page).toHaveURL(new RegExp(persona.profile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));

      await page.goto(persona.home);
      menu = await openWorkspaceMenu(page);
      await menu.getByRole("menuitem", { name: "Settings" }).click();
      await expect(page).toHaveURL(new RegExp(persona.settings.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
    });

    test(`${persona.name} sign out clears the client session and calls the logout API`, async ({ page }) => {
      await loginAs(page, persona.email);
      await page.goto(persona.home);
      const menu = await openWorkspaceMenu(page);

      const logoutResponse = page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/api/auth/logout",
      );
      await menu.getByRole("menuitem", { name: "Sign out" }).click();
      const response = await logoutResponse;

      expect(response.ok(), "logout API should accept the signed-in session").toBeTruthy();
      await expect(page).toHaveURL(/\/$/);
      await expect.poll(() => page.evaluate(() => localStorage.getItem("eventpass_token"))).toBeNull();
    });
  }
});
