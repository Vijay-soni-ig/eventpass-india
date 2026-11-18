import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function loginAs(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.ok(), `login failed for ${email}: ${await response.text()}`).toBeTruthy();
  const { token } = await response.json();
  expect(token).toBeTruthy();
  await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
}

async function submitAndReply(page: Page, route: string, subject: string) {
  await page.goto(route);
  await expect(page.getByRole("heading", { name: "Support", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /new support request/i }).click();
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Category").selectOption("technical");
  await page.getByLabel("Description").fill("The event workspace needs help with a configuration issue.");
  await page.getByRole("button", { name: "Submit request" }).click();

  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await expect(page.getByText("The event workspace needs help with a configuration issue.")).toBeVisible();

  await page.getByLabel("Your reply").fill("I have added the requested diagnostic details.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("I have added the requested diagnostic details.")).toBeVisible();
}

test.describe("Customer support workspace", () => {
  test("organizer can create a support request and reply", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await submitAndReply(page, "/organizer/support", `Organizer support request ${Date.now()}`);
  });

  test("exhibitor can create a support request and reply", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await submitAndReply(page, "/exhibitor-dashboard/support", `Exhibitor support request ${Date.now()}`);
  });
});
