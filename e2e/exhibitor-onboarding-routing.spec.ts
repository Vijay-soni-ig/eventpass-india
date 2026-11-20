import { test, expect, type APIRequestContext } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function createExhibitor(request: APIRequestContext) {
  const email = `e2e-exhibitor-onboarding-${Date.now()}@example.com`;
  const response = await request.post("/api/auth/signup", {
    data: { email, password: PASSWORD, fullName: "E2E Exhibitor", userType: "exhibitor" },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<{ token: string }>;
}

test.describe("Exhibitor onboarding routing", () => {
  test("exhibitor signup does not enter organizer onboarding", async ({ page, request }) => {
    const { token } = await createExhibitor(request);
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
    await page.goto("/auth");
    await expect(page).toHaveURL(/\/exhibitor-dashboard$/);
    await expect(page.getByText("Confirmed Exhibitions")).toBeVisible();
  });

  test("direct organizer onboarding URL redirects exhibitor to their home route", async ({ page, request }) => {
    const { token } = await createExhibitor(request);
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/exhibitor-dashboard$/);
    await expect(page.getByText("Confirmed Exhibitions")).toBeVisible();
  });
});
