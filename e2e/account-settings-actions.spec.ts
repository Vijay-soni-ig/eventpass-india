import { test, expect, type Page } from "@playwright/test";

const INITIAL_PASSWORD = "E2eStartPass456!";
const UPDATED_PASSWORD = "E2eChangedPass789!";

async function createSignedInVisitor(page: Page, label: string) {
  const email = `e2e-account-settings-${label}-${Date.now()}@example.com`;
  const response = await page.request.post("/api/auth/signup", {
    data: {
      email,
      password: INITIAL_PASSWORD,
      fullName: "E2E Account Settings",
      userType: "visitor",
    },
  });
  expect(response.status(), `signup failed: ${await response.text()}`).toBe(201);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
  await page.goto("/account/settings");
  await expect(page.getByRole("heading", { name: "Account Settings" })).toBeVisible();
  return email;
}

test.describe("Account settings actions", () => {
  test("saves profile changes and changes the password end-to-end", async ({ page }) => {
    const email = await createSignedInVisitor(page, "success");

    await page.getByLabel("Full name").fill("E2E Updated Visitor");
    await page.getByLabel("Phone").fill("+91 98765 43210");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();

    // Verify persistence after a fresh page load, not only the success toast.
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("E2E Updated Visitor");
    await expect(page.getByLabel("Phone")).toHaveValue("+91 98765 43210");

    await page.getByLabel("Current password").fill(INITIAL_PASSWORD);
    await page.getByLabel("New password").fill(UPDATED_PASSWORD);
    await page.getByLabel("Confirm new password").fill(UPDATED_PASSWORD);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("Password changed. You have been signed out on your other devices.")).toBeVisible();

    const newPasswordLogin = await page.request.post("/api/auth/login", {
      data: { email, password: UPDATED_PASSWORD },
    });
    expect(newPasswordLogin.status(), `new password should authenticate: ${await newPasswordLogin.text()}`).toBe(200);
    expect((await newPasswordLogin.json()).token).toBeTruthy();

    const oldPasswordLogin = await page.request.post("/api/auth/login", {
      data: { email, password: INITIAL_PASSWORD },
    });
    expect(oldPasswordLogin.status()).toBe(401);
  });

  test("shows a profile save error and preserves entered values when the API fails", async ({ page }) => {
    await createSignedInVisitor(page, "failure");
    await page.route("**/api/auth/me", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Injected profile failure" }),
      });
    });

    await page.getByLabel("Full name").fill("Unsaved Visitor Name");
    await page.getByLabel("Phone").fill("+91 99999 11111");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Injected profile failure")).toBeVisible();
    await expect(page.getByText("Profile updated")).toHaveCount(0);
    await expect(page.getByLabel("Full name")).toHaveValue("Unsaved Visitor Name");
    await expect(page.getByLabel("Phone")).toHaveValue("+91 99999 11111");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});
