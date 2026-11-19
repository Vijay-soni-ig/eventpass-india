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

test.describe("Notifications drawer", () => {
  test("View all opens an in-app drawer with filters instead of navigating", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard");

    const notificationBell = page.getByRole("button", { name: /notifications/i });
    await expect(notificationBell).toBeVisible();
    await notificationBell.click();
    await page.getByRole("button", { name: "View all" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(page).toHaveURL(/exhibitor-dashboard/);

    await page.getByRole("button", { name: "unread", exact: true }).click();
    await expect(page.getByRole("group", { name: "Filter notifications" })).toBeVisible();
    await page.getByRole("button", { name: "read", exact: true }).click();
    await expect(page.getByRole("button", { name: "read", exact: true })).toBeVisible();
  });
});
