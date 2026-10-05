import { test, expect, type Page } from "@playwright/test";

const SITE = "https://exhibittix.com";
const MARKETING = [
  { path: "/organizers", title: /Exhibition Management Software/ },
  { path: "/pricing", title: /Pricing/ },
  { path: "/exhibitors", title: /List Your Exhibition/ },
  { path: "/about", title: /About ExhibitTix/ },
  { path: "/contact", title: /Contact ExhibitTix/ },
  { path: "/help", title: /Help Centre/ },
  { path: "/how-exhibitions-work", title: /How to List Your Exhibition/ },
  { path: "/how-booking-works", title: /How Ticket Booking Works/ },
  { path: "/privacy", title: /Privacy Policy/ },
  { path: "/terms", title: /Terms of Service/ },
  { path: "/refund-policy", title: /Refund & Cancellation Policy/ },
  { path: "/exhibitions", title: /Discover Events/ },
];

const head = (page: Page, selector: string) => page.locator(`head ${selector}`);

async function expectIndexable(page: Page, path: string) {
  await expect(head(page, 'link[rel="canonical"]')).toHaveAttribute("href", `${SITE}${path}`);
  await expect(head(page, 'meta[name="robots"]')).toHaveAttribute("content", "index,follow");
  await expect(head(page, 'meta[property="og:url"]')).toHaveAttribute("content", `${SITE}${path}`);
  await expect(head(page, 'meta[property="og:image"]')).toHaveAttribute("content", /og-image\.jpg$/);
  await expect(head(page, 'meta[name="twitter:image"]')).toHaveAttribute("content", /og-image\.jpg$/);
  await expect(head(page, 'meta[name="twitter:title"]')).toHaveAttribute("content", /.+/);
  await expect(head(page, 'meta[name="twitter:description"]')).toHaveAttribute("content", /.{20,}/);
}

test.describe("Public page metadata", () => {
  for (const { path, title } of MARKETING) {
    test(`${path} has its own title, canonical and social tags`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(title);
      await expect(head(page, 'meta[name="description"]')).toHaveAttribute("content", /.{40,}/);
      await expect(head(page, 'meta[property="og:title"]')).toHaveAttribute("content", title);
      if (path === "/exhibitions") {
        await expect(head(page, 'link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/events`);
        await expect(head(page, 'meta[property="og:url"]')).toHaveAttribute("content", `${SITE}/events`);
      } else {
        await expectIndexable(page, path);
      }
      // One canonical and one robots tag, never duplicates.
      await expect(head(page, 'link[rel="canonical"]')).toHaveCount(1);
      await expect(head(page, 'meta[name="robots"]')).toHaveCount(1);
    });
  }

  test("the home page canonicalizes to itself", async ({ page }) => {
    await page.goto("/");
    await expectIndexable(page, "/");
  });

  test("client-side navigation keeps each page's own metadata", async ({ page }) => {
    await page.goto("/");
    await page.locator('a[href="/pricing"]:visible').first().click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(page).toHaveTitle(/Pricing/);
    await expectIndexable(page, "/pricing");

    await page.locator('a[href="/about"]:visible').first().click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page).toHaveTitle(/About ExhibitTix/);
    await expectIndexable(page, "/about");
  });
});

test.describe("Private and application pages stay noindex", () => {
  for (const path of ["/auth", "/organizer-demo", "/dashboard", "/my-tickets", "/organizer", "/platform", "/exhibitor-dashboard", "/definitely-not-a-page"]) {
    test(`${path} is noindex`, async ({ page }) => {
      await page.goto(path);
      await expect(head(page, 'meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
    });
  }

  test("moving from an indexable page to a private one does not keep 'index'", async ({ page }) => {
    await page.goto("/pricing");
    await expectIndexable(page, "/pricing");
    await page.locator('a[href^="/auth"]:visible').first().click();
    await expect(page).toHaveURL(/\/auth/);
    await expect(head(page, 'meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  });
});

test.describe("Crawler files", () => {
  test("robots.txt declares the sitemap and does not block /organizers", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/Sitemap: https:\/\/exhibittix\.com\/sitemap\.xml/);
    expect(body).toMatch(/^Disallow: \/organizer\/$/m);
    expect(body).toMatch(/^Disallow: \/organizer\$$/m);
    expect(body).not.toMatch(/^Disallow: \/organizer$/m);
    expect(body).toMatch(/^Disallow: \/platform$/m);
  });
});
