import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function loginAs(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.ok(), `login failed for ${email}: ${await response.text()}`).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

/**
 * Audits the navigation contract for each primary dashboard persona.
 * This checks that visible sidebar destinations render and do not redirect
 * to a 404 or access-denied surface. Feature-specific specs cover mutations.
 */
async function auditVisibleSidebarLinks(page: Page, homePath: string) {
  await page.goto(homePath);
  const nav = page.locator("aside nav");
  await expect(nav).toBeVisible();

  const links = await nav.getByRole("link").evaluateAll((elements) =>
    elements
      .map((element) => ({
        label: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
        href: element.getAttribute("href") ?? "",
      }))
      .filter((item) => item.href.startsWith("/")),
  );

  expect(links.length, `${homePath} should expose dashboard navigation links`).toBeGreaterThan(1);

  for (const { label, href } of links) {
    await test.step(`${homePath}: ${label || href} -> ${href}`, async () => {
      await page.goto(href);
      await expect(page.locator("header, aside").first(), `${href} should render the dashboard shell`).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByRole("heading", { name: "404", exact: true }), `${href} should not render 404`).toHaveCount(0);
      await expect(page.getByText("Access Denied", { exact: true }), `${href} should not deny the owning persona`).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
    });
  }
}

test.describe("Dashboard sidebar navigation audit", () => {
  test("organizer owner can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await auditVisibleSidebarLinks(page, "/organizer");
  });

  test("exhibitor owner can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await auditVisibleSidebarLinks(page, "/exhibitor-dashboard");
  });

  test("platform admin can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "platform.admin@eventpass.test");
    await auditVisibleSidebarLinks(page, "/platform");
  });
});
