import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function login(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  const responseBody = await response.text();
  expect(response.status(), `login failed for ${email}: ${responseBody}`).toBe(200);
  const payload = JSON.parse(responseBody);
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

test.describe("Exhibitor My Business navigation", () => {
  test("opens the business workspace and navigates to the company profile", async ({ page }) => {
    await login(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard");

    const workspaceNav = page.getByRole("navigation", { name: "Workspace navigation" });
    await workspaceNav.getByRole("link", { name: "My Business", exact: true }).click();
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/business$/);
    await expect(page.getByRole("heading", { name: "My Business", exact: true })).toBeVisible();

    await expect(page.getByRole("link", { name: /Company Profile/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Bank Setup/ })).toBeVisible();

    await page.getByRole("link", { name: /Company Profile/ }).click();
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/business\/profile$/);
    await expect(page.getByRole("heading", { name: "Company Profile", exact: true })).toBeVisible();
    await expect(workspaceNav.getByRole("link", { name: "My Business", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Back to My Business" })).toBeVisible();
    await page.getByRole("link", { name: "Back to My Business" }).click();
    await expect(page).toHaveURL(/\\/exhibitor-dashboard\\/business$/);
    await expect(page.getByRole("heading", { name: "My Business", exact: true })).toBeVisible();

    await page.getByRole("link", { name: /Bank Setup/ }).click();
    await expect(page).toHaveURL(/\\/exhibitor-dashboard\\/business\\/bank$/);
    await expect(page.getByRole("link", { name: "Back to My Business" })).toBeVisible();
    await page.getByRole("link", { name: "Back to My Business" }).click();
    await expect(page).toHaveURL(/\\/exhibitor-dashboard\\/business$/);

    await page.getByRole("link", { name: /Team & Roles/ }).click();
    await expect(page).toHaveURL(/\\/exhibitor-dashboard\\/business\\/team$/);
    await expect(page.getByRole("link", { name: "Back to My Business" })).toBeVisible();
    await page.getByRole("link", { name: "Back to My Business" }).click();
    await expect(page).toHaveURL(/\\/exhibitor-dashboard\\/business$/);

  });

  test("direct business profile URL survives refresh and keeps My Business active", async ({ page }) => {
    await login(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard/business/profile");

    await expect(page.getByRole("heading", { name: "Company Profile", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "My Business", exact: true })).toHaveAttribute("aria-current", "page");

    await page.reload();
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/business\/profile$/);
    await expect(page.getByRole("heading", { name: "Company Profile", exact: true })).toBeVisible();
  });
});
