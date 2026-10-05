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
    await expect(page).toHaveURL(/\/onboarding\/organization-profile$/);

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
    await page.getByRole("button", { name: "Save and continue" }).click();
    expect((await saved).status()).toBe(200);
    await expect(page).toHaveURL(/\/onboarding$/);

    // Completing only the profile step must not unlock the admin workspace.
    await page.goto("/organizer");
    await expect(page).toHaveURL(/\/onboarding$/);

    // The step now reads as complete, and stays complete after a reload.
    await page.goto("/onboarding");
    await expect(page.getByRole("button", { name: /1\. Complete organization profile/ })).toContainText("Complete");
    await page.reload();
    await expect(page.getByRole("button", { name: /1\. Complete organization profile/ })).toContainText("Complete");
  });

  test("an incomplete organizer cannot open the admin workspace by URL", async ({ page, request }) => {
    const email = "e2e-onboarding-gate-" + Date.now() + "@example.com";
    const signup = await request.post("/api/auth/signup", { data: { email, password: PASSWORD, fullName: "E2E Onboarding Gate", userType: "organizer" } });
    expect(signup.status()).toBe(201);
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    await page.goto("/organizer");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { level: 1, name: "Build your organizer workspace" })).toBeVisible();

    await page.goto("/organizer/profile");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { level: 1, name: "Build your organizer workspace" })).toBeVisible();

    await page.goto("/onboarding/organization-profile");
    await expect(page).toHaveURL(/\/onboarding\/organization-profile$/);
    await expect(page.getByRole("heading", { level: 1, name: "Complete organization profile" })).toBeVisible();
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
    await page.goto("/onboarding/organization-profile");
    await expect(page.getByRole("heading", { level: 1, name: "Complete organization profile" })).toBeVisible();
    await page.getByLabel("Business address").fill("abc");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Enter the full business address")).toBeVisible();
    expect(sent).toBe(false);
  });

  test("a new organizer can finish every required step through the UI and then enter the workspace", async ({ page, request }) => {
    const email = `e2e-onboarding-full-${Date.now()}@example.com`;
    const signup = await request.post("/api/auth/signup", { data: { email, password: PASSWORD, fullName: "E2E Onboarding Full Flow", userType: "organizer" } });
    expect(signup.status(), `signup failed: ${await signup.text()}`).toBe(201);
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    // The profile step is covered by the first test; set it up directly so this test
    // exercises the event steps the way a real organizer reaches them: through the checklist.
    const profile = await request.put("/api/organizer/profile", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { businessType: "Private Limited", address: "12 Ashram Road, Navrangpura, Ahmedabad 380009", city: "Ahmedabad", state: "Gujarat", country: "India" },
    });
    expect(profile.status(), `profile setup failed: ${await profile.text()}`).toBe(200);

    // The checklist now points at "Create your first event". Following it must not bounce back.
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: "Build your organizer workspace" })).toBeVisible();
    await page.getByRole("link", { name: "Complete this step" }).click();
    await expect(page).toHaveURL(/\/organizer\/events\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "Create Event" })).toBeVisible();

    await page.getByRole("button", { name: /^Conference/ }).click();
    await page.locator("#event-title").fill(`E2E Onboarding Conference ${Date.now()}`);
    await page.locator("#event-category").click();
    await page.getByRole("option").first().click();
    await page.locator("#event-city").fill("Ahmedabad");
    await page.locator("#event-venue").fill("E2E Onboarding Convention Centre");
    await page.locator("#event-start-date").fill("2028-02-10");
    await page.locator("#event-end-date").fill("2028-02-11");
    await page.getByRole("button", { name: /Create Draft Event/ }).click();
    await expect(page).toHaveURL(/\/organizer\/events\/(?!new$)[^/]+$/);

    // Publishing is the last required step.
    const refreshed = page.waitForResponse((r) => r.url().endsWith("/api/onboarding") && r.request().method() === "GET");
    const published = page.waitForResponse((r) => /\/api\/events\/[^/]+\/publish$/.test(r.url()) && r.request().method() === "POST");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    expect((await published).status()).toBe(200);
    expect((await refreshed).status()).toBe(200);

    // Navigate inside the app (no reload). The workspace must unlock immediately,
    // not after the cached onboarding status goes stale.
    await page.getByRole("link", { name: "Back to events" }).click();
    await expect(page).toHaveURL(/\/organizer\/events$/);
    await page.goto("/organizer");
    await expect(page).toHaveURL(/\/organizer$/);
  });
});
