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

async function submitWorkspaceSearch(page: Page, query: string) {
  const search = page.getByRole("textbox", { name: "Search workspace" });
  await expect(search).toBeVisible();
  await search.fill(query);
  await search.press("Enter");
}

test.describe("Dashboard header search routing", () => {
  test("organizer search stays inside organizer routes", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await page.goto("/organizer");
    await submitWorkspaceSearch(page, "tickets");
    await expect(page).toHaveURL(/\/organizer\/tickets$/);
  });

  test("exhibitor search stays inside exhibitor routes", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard");
    await submitWorkspaceSearch(page, "leads");
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/leads$/);
  });

  test("platform admin search stays inside platform routes", async ({ page }) => {
    await loginAs(page, "platform.admin@eventpass.test");
    await page.goto("/platform");
    await submitWorkspaceSearch(page, "events");
    await expect(page).toHaveURL(/\/platform\/exhibitions$/);
  });

  test("empty search does not navigate away", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await page.goto("/organizer");
    await submitWorkspaceSearch(page, "   ");
    await expect(page).toHaveURL(/\/organizer$/);
  });
});
