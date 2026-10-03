import { test, expect } from "@playwright/test";

const PASSWORD = "DevPassword123!";

test.describe("Organizer onboarding", () => {
  test("a new organizer completes the organization profile step without a platform admin", async ({ page, request }) => {
    const email = `e2e-onboarding-${Date.now()}@example.com`;
    const signup = await request.post("/api/auth/signup", { data: { email, password: PASSWORD, fullName: "E2E Onboarding Organizer", userType: "organizer" } });
    expect(signup.status(), `signup failed: ${await signup.text()}`).toBe(201);
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    // The required profile step is open and leads to the profile page.
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: "Build your organizer workspace" })).toBeVisible();
    const profileStep = page.getByRole("button", { name: /1\. Complete organization profile/ });
    await expect(profileStep).toContainText("Required");
    await page.getByRole("link", { name: "Complete this step" }).click();
    await expect(page).toHaveURL(/\/organizer\/profile$/);

    // The organizer can enter every field the step needs.
    await page.getByLabel("Business type").click();
    await page.getByRole("option", { name: "LLP" }).click();
    await page.getByLabel("Business address").fill("12 Ashram Road, Navrangpura, Ahmedabad 380009");
    await page.getByLabel("City").fill("Ahmedabad");
    await page.getByLabel("Country").click();
    await page.getByRole("option", { name: "India" }).click();
    await page.getByLabel("State / Province").click();
    await page.getByRole("option", { name: "Gujarat" }).click();

    const saved = page.waitForResponse((r) => r.url().includes("/api/organizer/profile") && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Save Changes" }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText("Profile updated")).toBeVisible();

    // The step now reads as complete, and stays complete after a reload.
    await page.goto("/onboarding");
    await expect(page.getByRole("button", { name: /1\. Complete organization profile/ })).toContainText("Complete");
    await page.reload();
    await expect(page.getByRole("button", { name: /1\. Complete organization profile/ })).toContainText("Complete");
  });

  test("the business address is validated before it is sent", async ({ page, request }) => {
    const email = `e2e-onboarding-invalid-${Date.now()}@example.com`;
    const signup = await request.post("/api/auth/signup", { data: { email, password: PASSWORD, fullName: "E2E Onboarding Invalid", userType: "organizer" } });
    expect(signup.status()).toBe(201);
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    let sent = false;
    await page.route("**/api/organizer/profile", (route) => {
      if (route.request().method() === "PUT") sent = true;
      return route.continue();
    });
    await page.goto("/organizer/profile");
    await page.getByLabel("Business address").fill("abc");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Enter the full business address")).toBeVisible();
    expect(sent).toBe(false);
  });
});
