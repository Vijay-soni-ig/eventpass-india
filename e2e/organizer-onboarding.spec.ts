import { test, expect } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const LOGO_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test.describe("Organizer onboarding v2", () => {
  test("shows the organizer-first flow and does not force event creation", async ({ page, request }) => {
    const email = "e2e-onboarding-v2-" + Date.now() + "@example.com";
    const signup = await request.post("/api/auth/signup", {
      data: { email, password: PASSWORD, fullName: "E2E Organizer", userType: "organizer" },
    });
    expect(signup.status(), await signup.text()).toBe(201);
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { level: 1, name: "Build your organizer profile" })).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByText("Tell us about your organization")).toBeVisible();
    await expect(page.getByText("Complete your first event")).toHaveCount(0);

    await page.goto("/organizer/events/new");
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("completes the organizer profile, branding, optional experience, and public page without creating an event", async ({ page, request }) => {
    const email = "e2e-onboarding-v2-full-" + Date.now() + "@example.com";
    const signup = await request.post("/api/auth/signup", {
      data: { email, password: PASSWORD, fullName: "E2E Organizer Full", userType: "organizer" },
    });
    expect(signup.status(), await signup.text()).toBe(201);
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    await page.goto("/onboarding");

    await page.getByLabel("Organization name *").fill("E2E Organizer Full");
    await page.getByLabel("Business type *").click();
    await page.getByRole("option", { name: "LLP" }).click();
    await page.getByLabel("Country *").click();
    await page.getByRole("option", { name: "India" }).click();
    await page.getByLabel("Business address *").fill("12 Ashram Road, Navrangpura, Ahmedabad 380009");
    await page.getByLabel("City *").fill("Ahmedabad");
    await page.getByLabel("State / Province *").click();
    await page.getByRole("option", { name: "Gujarat" }).click();
    await page.getByLabel("Public email").fill("organizer@example.com");
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByText("Step 2 of 4")).toBeVisible();

    const logoBuffer = Buffer.from(LOGO_BASE64, "base64");
    const logoUpload = await request.post("/api/organizer/profile/logo", {
      headers: { Authorization: "Bearer " + token },
      multipart: {
        logo: { name: "logo.png", mimeType: "image/png", buffer: logoBuffer },
      },
    });
    expect(logoUpload.status(), await logoUpload.text()).toBe(200);

    await page.reload();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await page.getByLabel("Organization description *").fill("We organize professional exhibitions, conferences and business events across India.");
    await page.getByLabel("Website").fill("https://example.com");
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Skip this step" }).click();

    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await page.getByLabel("Public page URL *").fill("e2e-organizer-full");
    await page.getByLabel("Publish organizer page").click();
    await page.getByRole("button", { name: "Create organizer page" }).click();

    await expect(page).toHaveURL(/\/organizer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Organizer Dashboard" })).toBeVisible();

    // Event creation is now a workspace action, not an onboarding requirement.
    await page.goto("/organizer/events/new");
    await expect(page).toHaveURL(/\/organizer\/events\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "Create Event" })).toBeVisible();
  });

  test("the legacy organization-profile onboarding URL redirects into the unified flow", async ({ page, request }) => {
    const email = "e2e-onboarding-v2-legacy-" + Date.now() + "@example.com";
    const signup = await request.post("/api/auth/signup", {
      data: { email, password: PASSWORD, fullName: "E2E Legacy URL", userType: "organizer" },
    });
    expect(signup.status()).toBe(201);
    const { token } = await signup.json();
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    await page.goto("/onboarding/organization-profile");
    await expect(page).toHaveURL(/\/onboarding\?step=0$/);
    await expect(page.getByRole("heading", { level: 2, name: "Tell us about your organization" })).toBeVisible();
  });
});
