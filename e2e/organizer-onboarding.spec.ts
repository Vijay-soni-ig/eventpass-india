import { test, expect, type APIRequestContext } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function createOrganizer(request: APIRequestContext, label: string) {
  const email = `e2e-onboarding-${label}-${Date.now()}@example.com`;
  const signup = await request.post("/api/auth/signup", {
    data: { email, password: PASSWORD, fullName: `E2E Organizer ${label}`, userType: "organizer" },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  return signup.json() as Promise<{ token: string }>;
}

test.describe("Organizer onboarding", () => {
  test("organizer completes profile, branding, insights, and organizer page before entering dashboard", async ({ page, request }) => {
    const { token } = await createOrganizer(request, "full");
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
    await page.goto("/onboarding");

    await expect(page.getByRole("heading", { level: 2, name: "Organization profile" })).toBeVisible();
    await page.getByLabel("Organization name *").fill("E2E Events LLP");
    await page.getByLabel("Business type *").click();
    await page.getByRole("option", { name: "LLP" }).click();
    await page.getByLabel("Country *").click();
    await page.getByRole("option", { name: "India" }).click();
    await page.getByLabel("Business address *").fill("12 Ashram Road, Navrangpura, Ahmedabad 380009");
    await page.getByLabel("City *").fill("Ahmedabad");
    await page.getByLabel("State / Province *").click();
    await page.getByRole("option", { name: "Gujarat" }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Organization branding" })).toBeVisible();
    await page.getByLabel("About your organization *").fill("We organize professional events, exhibitions, and conferences.");
    await page.getByLabel("Website").fill("https://example.com");
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "About your events" })).toBeVisible();
    await page.getByRole("button", { name: "Google" }).click();
    await page.getByRole("button", { name: "Monthly" }).click();
    await page.getByRole("button", { name: "101–500 people" }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Create your organizer page" })).toBeVisible();
    await page.getByLabel("Organizer page URL *").fill("e2e-events-llp");
    await page.getByLabel("Public email").fill("hello@example.com");
    await page.getByRole("button", { name: "Save organizer page" }).click();

    await expect(page).toHaveURL(/\/organizer$/);
    await expect(page.getByText("Organizer")).toBeVisible();
  });

  test("incomplete organizer cannot enter the dashboard by direct URL", async ({ page, request }) => {
    const { token } = await createOrganizer(request, "gate");
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);

    await page.goto("/organizer");
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { level: 2, name: "Organization profile" })).toBeVisible();

    await page.goto("/organizer/profile");
    await expect(page).toHaveURL(/\/onboarding/);

    await page.goto("/onboarding/organization-profile");
    await expect(page).toHaveURL(/\/onboarding\?step=0/);
    await expect(page.getByRole("heading", { level: 2, name: "Organization profile" })).toBeVisible();
  });

  test("invalid organization address is rejected before the profile is saved", async ({ page, request }) => {
    const { token } = await createOrganizer(request, "invalid");
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
    await page.goto("/onboarding");

    await page.getByLabel("Organization name *").fill("Invalid Address Org");
    await page.getByLabel("Business type *").click();
    await page.getByRole("option", { name: "Proprietorship" }).click();
    await page.getByLabel("Country *").click();
    await page.getByRole("option", { name: "India" }).click();
    await page.getByLabel("Business address *").fill("abc");
    await page.getByLabel("City *").fill("Ahmedabad");
    await page.getByLabel("State / Province *").click();
    await page.getByRole("option", { name: "Gujarat" }).click();

    let sent = false;
    await page.route("**/api/organizer/profile", async (route) => {
      if (route.request().method() === "PUT") sent = true;
      await route.continue();
    });
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Enter your full business address")).toBeVisible();
    expect(sent).toBe(false);
  });
});
