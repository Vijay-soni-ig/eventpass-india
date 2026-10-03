import { test, expect } from "@playwright/test";

const TITLE = "ExhibitTix | Events & Exhibitions in India: Tickets, Stalls and Check-in";

test.describe("Homepage positioning", () => {
  test("presents ExhibitTix as an events and exhibitions platform", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Discover Events & Exhibitions Near You" })).toBeVisible();
    await expect(page.getByText("Find exhibitions, trade fairs, conferences and other events across India.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Discover Events & Exhibitions", exact: true })).toBeVisible();
    // The visitor-focused tiles stay as they were.
    for (const tile of ["Secure Payments", "Digital QR Tickets", "Easy Check-in"]) {
      await expect(page.getByRole("heading", { name: tile })).toBeVisible();
    }
  });

  test("has its own title, description and canonical", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(TITLE);
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
      "content",
      "Discover events and exhibitions across India and book tickets. Organizers manage stalls, exhibitors, ticketing and check-in on one platform.",
    );
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute("href", "https://exhibittix.com/");
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "index,follow");
    await expect(page.locator('head meta[property="og:title"]')).toHaveAttribute("content", TITLE);
  });

  test("the organizer call to action leads to /organizers and keeps the how-it-works link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Run an Event or Exhibition?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Learn How It Works" })).toHaveAttribute("href", "/how-exhibitions-work");
    // The old homepage shortcut is gone from this section.
    const band = page.locator("section", { has: page.getByRole("heading", { name: "Run an Event or Exhibition?" }) });
    await expect(band.getByRole("link", { name: "Create Your Exhibition" })).toHaveCount(0);

    const cta = page.getByRole("link", { name: "Explore for Organizers" });
    await expect(cta).toHaveAttribute("href", "/organizers");
    await cta.click();
    await expect(page).toHaveURL(/\/organizers$/);
    await expect(page).toHaveTitle(/Exhibition Management Software/);
  });

  test("offers a visible path to all events", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: "Browse all events" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/events");
    await link.click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByRole("heading", { name: "Find events worth attending" })).toBeVisible();
  });

  test("homepage search still goes to the exhibitions listing", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: /Search exhibitions/ }).fill("expo");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/exhibitions\?.*search=expo/);
  });
});
