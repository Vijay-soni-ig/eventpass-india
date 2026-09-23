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
  return payload.token as string;
}

test.describe("Universal Event participant workspace", () => {
  test("loads participant modules and manages a participant", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push("PAGEERROR: " + error.message));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push("CONSOLE: " + message.text()); });
    const token = await login(page);
    const exhibitionResponse = await page.request.get("/api/exhibitions/" + EXHIBITION_ID, { headers: { Authorization: "Bearer " + token } });
    expect(exhibitionResponse.ok()).toBeTruthy();
    const exhibitionPayload = await exhibitionResponse.json();
    expect(exhibitionPayload.exhibition.eventId).toBe("e2e-lead-event-001");

    await page.goto("/organizer/exhibitions/" + EXHIBITION_ID + "/participants");
    await page.waitForLoadState("networkidle");
    const heading = page.getByRole("heading", { name: "Event Participants" });
    if (!(await heading.isVisible().catch(() => false))) {
      throw new Error("Participant workspace did not render. URL=" + page.url() + "\nBROWSER_ERRORS=" + browserErrors.join(" | ") + "\nBODY=" + (await page.locator("body").innerText()).slice(0, 3000));
    }
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
