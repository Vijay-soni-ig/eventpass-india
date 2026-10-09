import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function createOrganizer(request: APIRequestContext) {
  const unique = `ui-settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await request.post("/api/auth/signup", {
    data: {
      email: `${unique}@example.com`,
      password: PASSWORD,
      fullName: "E2E Settings Organizer",
      userType: "organizer",
    },
  });
  expect(response.status(), `organizer signup failed: ${await response.text()}`).toBe(201);

  const payload = await response.json();
  const token = payload.token as string;
  expect(token).toBeTruthy();

  const profileResponse = await request.put("/api/organizer/profile", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      businessType: "Private Limited",
      address: "12 Ashram Road, Navrangpura",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
      description: "Organizer created for settings interaction regression coverage.",
      website: "https://example.com",
      slug: unique,
      publicProfileEnabled: false,
    },
  });
  expect(profileResponse.status(), `organizer profile setup failed: ${await profileResponse.text()}`).toBe(200);

  return { token };
}

async function signIn(page: Page, token: string) {
  await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
}

test.describe("Organizer settings interactions", () => {
  test("profile, notification preference and appearance controls apply and persist", async ({ page, request }) => {
    const organizer = await createOrganizer(request);
    await signIn(page, organizer.token);
    await page.goto("/organizer/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    // A success toast is not enough: the profile must survive a fresh page load.
    await page.getByLabel("Full name").fill("E2E Updated Settings Organizer");
    await page.getByLabel("Phone").fill("+91 98765 43210");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Account profile updated")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("E2E Updated Settings Organizer");
    await expect(page.getByLabel("Phone")).toHaveValue("+91 98765 43210");

    // Notification switches must call the API and keep the chosen value after reload.
    const emailPreference = page.getByRole("switch", { name: "Event published: Email" });
    await expect(emailPreference).toBeVisible();
    await expect(emailPreference).toHaveAttribute("aria-checked", "true");
    await emailPreference.click();
    await expect(emailPreference).toHaveAttribute("aria-checked", "false");
    await page.reload();
    await expect(page.getByRole("switch", { name: "Event published: Email" })).toHaveAttribute("aria-checked", "false");

    // Appearance is a local browser preference and must also survive a reload.
    const darkMode = page.getByRole("switch", { name: "Toggle dark mode" });
    const before = await darkMode.getAttribute("aria-checked");
    await darkMode.click();
    const after = before === "true" ? "false" : "true";
    await expect(darkMode).toHaveAttribute("aria-checked", after);
    await page.reload();
    await expect(page.getByRole("switch", { name: "Toggle dark mode" })).toHaveAttribute("aria-checked", after);
  });
});
