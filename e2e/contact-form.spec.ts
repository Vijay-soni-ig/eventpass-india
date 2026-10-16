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

  test("a server failure is announced, preserves the message, and retries successfully", async ({ page }) => {
    let requests = 0;
    let submittedPayload: Record<string, unknown> | undefined;
    await page.route("**/api/public/contact-requests", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests += 1;
      if (requests === 1) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Contact service temporarily unavailable" }),
        });
        return;
      }
      submittedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ request: { id: "e2e-contact-request-001" } }),
      });
    });

    await page.goto("/contact");
    await fillForm(page, "e2e-contact-fail@example.com");
    await page.getByRole("button", { name: "Send Message" }).click();

    await expect(page.getByText(/couldn't send your message/i)).toBeVisible();
    await expect(page.getByText(SUCCESS)).toHaveCount(0);
    await expect(page.locator("#name")).toHaveValue("E2E Contact");
    await expect(page.locator("#email")).toHaveValue("e2e-contact-fail@example.com");
    await expect(page.locator("#subject")).toHaveValue("E2E contact subject");
    await expect(page.locator("#message")).toHaveValue("This is an end to end contact message sent by the browser test.");
    await expect(page.getByRole("button", { name: "Send Message" })).toBeEnabled();

    await page.getByRole("button", { name: "Send Message" }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByText(SUCCESS)).toBeVisible();
    expect(submittedPayload).toMatchObject({
      name: "E2E Contact",
      email: "e2e-contact-fail@example.com",
      subject: "E2E contact subject",
      message: "This is an end to end contact message sent by the browser test.",
    });
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
