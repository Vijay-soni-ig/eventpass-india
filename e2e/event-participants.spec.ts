import { test, expect, type Page } from "@playwright/test";

const EXHIBITION_ID = "seed-exhibition-1";
const EMAIL = "org1.owner@eventpass.test";
const PASSWORD = "DevPassword123!";

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

test.describe("Universal Event participant workspace", () => {
  test("loads participant modules and manages a participant", async ({ page }) => {
    await login(page);
    await page.goto("/organizer/exhibitions/" + EXHIBITION_ID + "/participants");

    await expect(page.getByRole("heading", { name: "Event Participants" })).toBeVisible();
    await expect(page.getByText("Participant modules")).toBeVisible();
    await expect(page.getByRole("button", { name: /Participants: Enabled/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Speakers: Enabled/ })).toBeVisible();

    await page.getByRole("button", { name: /Add Participant/ }).click();
    await page.getByLabel("Name").fill("Browser E2E Participant");
    await page.getByLabel("Organization").fill("E2E Organization");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByText("Browser E2E Participant", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).last().click();
    await page.getByLabel("Status").selectOption("INACTIVE");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.getByLabel("Participant status").selectOption("INACTIVE");
    await expect(page.getByText("Browser E2E Participant", { exact: true })).toBeVisible();

    await page.getByLabel("Participant status").selectOption("ACTIVE");
    await page.getByRole("button", { name: "Speakers" }).click();
    await expect(page.getByText("E2E Speaker", { exact: true })).toBeVisible();
  });
});
