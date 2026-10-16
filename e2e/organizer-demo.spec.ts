import { test, expect } from "@playwright/test";

test.describe("Organizer demo lead capture", () => {
  test("submission failure is visible, preserves details, and can be retried successfully", async ({ page }) => {
    let requests = 0;
    let successfulPayload: Record<string, unknown> | undefined;

    await page.route("**/api/public/demo-requests", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requests += 1;

      if (requests === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Demo request service temporarily unavailable" }),
        });
        return;
      }

      successfulPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ request: { id: "e2e-demo-request-001" } }),
      });
    });

    await page.goto("/organizer-demo");
    await expect(page.getByRole("heading", { name: "Book a personalized demo" })).toBeVisible();

    await page.locator("#demo-name").fill("Aarav Shah");
    await page.locator("#demo-company").fill("Ahmedabad Expo Group");
    await page.locator("#demo-email").fill("aarav@example.com");
    await page.locator("#demo-phone").fill("9876543210");
    await page.locator("#demo-message").fill("We organize two exhibitions each year.");

    await page.getByRole("button", { name: "Request a Demo" }).click();
    await expect(page.getByRole("alert")).toContainText("Demo request service temporarily unavailable");
    await expect(page.getByRole("heading", { name: "Demo request received." })).toHaveCount(0);
    await expect(page.locator("#demo-name")).toHaveValue("Aarav Shah");
    await expect(page.locator("#demo-company")).toHaveValue("Ahmedabad Expo Group");
    await expect(page.locator("#demo-email")).toHaveValue("aarav@example.com");
    await expect(page.locator("#demo-phone")).toHaveValue("9876543210");
    await expect(page.locator("#demo-message")).toHaveValue("We organize two exhibitions each year.");

    await page.getByRole("button", { name: "Request a Demo" }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByRole("heading", { name: "Demo request received." })).toBeVisible();

    expect(successfulPayload).toMatchObject({
      name: "Aarav Shah",
      companyName: "Ahmedabad Expo Group",
      email: "aarav@example.com",
      phone: "9876543210",
      message: "We organize two exhibitions each year.",
      source: "organizer_landing_page",
    });
  });
});
