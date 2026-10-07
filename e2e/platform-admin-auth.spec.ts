import { test, expect } from "@playwright/test";

const PLATFORM_ADMIN_EMAIL = "platform.admin@eventpass.test";
const PLATFORM_ADMIN_PASSWORD = "DevPassword123!";

test.describe("Platform admin authentication routing", () => {
  test("platform admin lands in the platform control plane", async ({ page, request }) => {
    const login = await request.post("/api/auth/login", {
      data: {
        email: PLATFORM_ADMIN_EMAIL,
        password: PLATFORM_ADMIN_PASSWORD,
      },
    });

    expect(login.status(), `platform admin login failed: ${await login.text()}`).toBe(200);

    const body = await login.json();
    expect(body.user.platformRole).toBe("super_admin");
    expect(body.user.roles.platformAdmin).toBe(true);

    await page.addInitScript((token) => {
      localStorage.setItem("eventpass_token", token);
    }, body.token);

    await page.goto("/auth");
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole("heading", { name: /platform/i })).toBeVisible();
  });

  test("platform admin can manage event categories end-to-end", async ({ page }) => {
    await page.goto("/platform/event-categories");
    await expect(page).toHaveURL(/\/platform\/event-categories$/);
    await expect(page.getByRole("heading", { name: "Event Categories" })).toBeVisible();

    const suffix = Date.now().toString();
    const categoryName = `E2E Category ${suffix}`;
    const categorySlug = `e2e-category-${suffix}`;

    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Name *").fill(categoryName);
    await page.getByRole("dialog").getByLabel("Slug").fill(categorySlug);
    await page.getByRole("dialog").getByRole("button", { name: "Create category" }).click();

    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    const categoryRow = page.locator("div.rounded-lg.border").filter({ hasText: categoryName }).first();
    await expect(categoryRow).toBeVisible();
    await expect(categoryRow.getByText("Active", { exact: true })).toBeVisible();

    await categoryRow.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();

    await expect(categoryRow.getByText("Archived", { exact: true })).toBeVisible();
    await categoryRow.getByRole("button", { name: "Restore" }).click();
    await expect(categoryRow.getByText("Active", { exact: true })).toBeVisible();

    await page.getByLabel("Show archived").check();
    await page.getByPlaceholder("Search name, slug or description...").fill(categorySlug);
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();
  });

});
