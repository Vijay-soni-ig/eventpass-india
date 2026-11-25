import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function login(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.status(), `login failed for ${email}: ${await response.text()}`).toBe(200);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

test.describe("Dashboard mobile navigation", () => {
  test("exhibitor can reach every permitted workspace section from the mobile menu", async ({ page }) => {
    await login(page, "biz1.owner@eventpass.test");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/exhibitor-dashboard");

    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const menu = dialog.getByRole("navigation", { name: "All workspace sections" });
    for (const label of ["Dashboard", "Discover", "My Business", "My Participations", "Documents", "Leads", "Exhibitions", "Stalls", "Sales", "Attendees", "Scanner", "Analytics", "Support", "Settings"]) {
      await expect(menu.getByRole("link", { name: label, exact: true }), `mobile menu should expose ${label}`).toBeVisible();
    }

    await expect(menu.getByRole("link", { name: "Tickets", exact: true })).toHaveCount(0);
    await menu.getByRole("link", { name: "Discover", exact: true }).click();
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/discover$/);
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Discover Events", exact: true })).toBeVisible();
  });

  test("organizer can reach every permitted workspace section from the mobile menu", async ({ page }) => {
    await login(page, "org1.owner@eventpass.test");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/organizer");

    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const menu = dialog.getByRole("navigation", { name: "All workspace sections" });
    for (const label of ["Events", "Exhibitions", "Venues", "Exhibitors", "Stalls", "Visitors", "Registrations", "Tickets", "Check-in", "Leads", "Marketing", "Payments", "Event Analytics", "Team", "Public Profile", "Gallery", "Plan & billing", "Settings"]) {
      await expect(menu.getByRole("link", { name: label, exact: true }), `mobile menu should expose ${label}`).toBeVisible();
    }

    await menu.getByRole("link", { name: "Venues", exact: true }).click();
    await expect(page).toHaveURL(/\/organizer\/venues$/);
    await expect(dialog).toBeHidden();
  });
});
