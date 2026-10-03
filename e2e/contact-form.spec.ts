import { test, expect, type Page } from "@playwright/test";

const SUCCESS = "Message sent successfully";

async function fillForm(page: Page, email: string) {
  await page.locator("#name").fill("E2E Contact");
  await page.locator("#email").fill(email);
  await page.locator("#subject").fill("E2E contact subject");
  await page.locator("#message").fill("This is an end to end contact message sent by the browser test.");
}

test.describe("Contact form", () => {
  test("a valid message is sent to the API and only then shown as sent", async ({ page }) => {
    await page.goto("/contact");
    await fillForm(page, `e2e-contact-${Date.now()}@example.com`);

    const request = page.waitForResponse((r) => r.url().includes("/api/public/contact-requests") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Send Message" }).click();
    const response = await request;

    expect(response.status()).toBe(201);
    await expect(page.getByText(SUCCESS)).toBeVisible();
  });

  test("a server failure shows an error, never 'sent', and keeps the message for retry", async ({ page }) => {
    await page.route("**/api/public/contact-requests", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }),
    );
    await page.goto("/contact");
    await fillForm(page, "e2e-contact-fail@example.com");
    await page.getByRole("button", { name: "Send Message" }).click();

    await expect(page.getByText(/couldn't send your message/i)).toBeVisible();
    await expect(page.getByText(SUCCESS)).toHaveCount(0);
    await expect(page.locator("#subject")).toHaveValue("E2E contact subject");
    await expect(page.getByRole("button", { name: "Send Message" })).toBeEnabled();
  });

  test("client-side validation blocks an empty submit without calling the API", async ({ page }) => {
    let called = false;
    await page.route("**/api/public/contact-requests", (route) => {
      called = true;
      return route.abort();
    });
    await page.goto("/contact");
    await page.getByRole("button", { name: "Send Message" }).click();
    await expect(page.getByText("Please enter your name.")).toBeVisible();
    expect(called).toBe(false);
  });

  test("works on a phone-sized screen with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/contact");
    await fillForm(page, `e2e-contact-mobile-${Date.now()}@example.com`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.getByRole("button", { name: "Send Message" }).click();
    await expect(page.getByText(SUCCESS)).toBeVisible();
  });
});
