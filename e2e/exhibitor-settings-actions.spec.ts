import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function createExhibitor(request: APIRequestContext) {
  const unique = `ui-exhibitor-settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await request.post("/api/auth/signup", {
    data: { email: `${unique}@example.com`, password: PASSWORD, fullName: "E2E Settings Exhibitor", userType: "exhibitor" },
  });
  expect(response.status(), `exhibitor signup failed: ${await response.text()}`).toBe(201);
  const payload = await response.json();
  return { token: payload.token as string };
}

async function signIn(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
}

test.describe("Exhibitor settings interactions", () => {
  test("profile, notification preference and appearance persist", async ({ page, request }) => {
    const exhibitor = await createExhibitor(request);
    await signIn(page, exhibitor.token);
    await page.goto("/exhibitor/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await page.getByLabel("Full name").fill("E2E Updated Exhibitor");
    await page.getByLabel("Phone").fill("+91 98765 43210");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Account profile updated")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("E2E Updated Exhibitor");
    await expect(page.getByLabel("Phone")).toHaveValue("+91 98765 43210");

    const emailPreference = page.getByRole("switch", { name: "Event published: Email" });
    await expect(emailPreference).toBeVisible();
    const previous = await emailPreference.getAttribute("aria-checked");
    await emailPreference.click();
    const changed = previous === "true" ? "false" : "true";
    await expect(emailPreference).toHaveAttribute("aria-checked", changed);
    await page.reload();
    await expect(page.getByRole("switch", { name: "Event published: Email" })).toHaveAttribute("aria-checked", changed);

    const darkMode = page.getByRole("switch", { name: "Toggle dark mode" });
    const themeBefore = await darkMode.getAttribute("aria-checked");
    await darkMode.click();
    const themeAfter = themeBefore === "true" ? "false" : "true";
    await expect(darkMode).toHaveAttribute("aria-checked", themeAfter);
    await page.reload();
    await expect(page.getByRole("switch", { name: "Toggle dark mode" })).toHaveAttribute("aria-checked", themeAfter);
  });

  test("profile save failure is surfaced and unsaved values remain editable", async ({ page, request }) => {
    const exhibitor = await createExhibitor(request);
    await signIn(page, exhibitor.token);
    await page.goto("/exhibitor/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    await page.route("**/api/auth/me", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Injected exhibitor profile failure" }) });
    });
    await page.getByLabel("Full name").fill("Unsaved Exhibitor Name");
    await page.getByLabel("Phone").fill("+91 99999 11111");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Injected exhibitor profile failure|failed to update|could not update|unable to update/i)).toBeVisible();
    await expect(page.getByText("Account profile updated")).toHaveCount(0);
    await expect(page.getByLabel("Full name")).toHaveValue("Unsaved Exhibitor Name");
    await expect(page.getByLabel("Phone")).toHaveValue("+91 99999 11111");
  });
});
