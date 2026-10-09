import { test, expect } from "@playwright/test";

/**
 * Broad public-screen smoke coverage. This is intentionally a render contract,
 * not a substitute for feature-specific interaction tests.
 *
 * Keep this list to stable public routes. Dynamic and authenticated routes are
 * covered by their persona/workflow specs so this test does not hide auth bugs.
 */
const PUBLIC_ROUTES = [
  "/",
  "/events",
  "/exhibitions",
  "/discover",
  "/exhibitors",
  "/organizers",
  "/organizer-demo",
  "/pricing",
  "/about",
  "/contact",
  "/help",
  "/how-booking-works",
  "/how-exhibitions-work",
  "/refund-policy",
  "/terms",
  "/privacy",
];

test.describe("Public screen smoke audit", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} renders without an uncaught browser exception`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(route);
      expect(response, `${route} should return a document response`).not.toBeNull();
      expect(response!.status(), `${route} should not return an HTTP error`).toBeLessThan(400);

      // Wait for React to render a meaningful application surface.
      await expect(page.locator("body")).not.toBeEmpty();
      await expect(page.locator("header, main, [role='main']").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);

      expect(pageErrors, `${route} raised uncaught browser exceptions`).toEqual([]);
    });
  }

  test("public screens remain within a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    for (const route of ["/", "/events", "/organizers", "/pricing", "/contact"]) {
      await page.goto(route);
      await expect(page.locator("header, main, [role='main']").first()).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));

      expect(
        dimensions.documentWidth,
        `${route} should not create horizontal page overflow on mobile`,
      ).toBeLessThanOrEqual(dimensions.viewportWidth);
    }
  });
});
