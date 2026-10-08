import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";

async function loginAs(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json();
  expect(token).toBeTruthy();
  await page.addInitScript((t) => localStorage.setItem("eventpass_token", t), token);
}

async function openProfileMenu(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open profile menu" }).click();
  return page.getByRole("menu");
}

async function menuHrefs(page: Page) {
  return page.getByRole("menu").getByRole("menuitem").evaluateAll((items) =>
    items.map((el) => el.getAttribute("href") ?? el.closest("a")?.getAttribute("href") ?? el.textContent?.trim() ?? ""),
  );
}

test.describe("Header profile menu", () => {
  test("organizer owner sees organizer host controls and a role badge", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    const menu = await openProfileMenu(page);

    await expect(menu.getByText("Organizer · Owner")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Organizer Dashboard" })).toHaveAttribute("href", "/organizer");
    await expect(menu.getByRole("menuitem", { name: "Create an Exhibition" })).toHaveAttribute("href", "/organizer/events/new");
    await expect(menu.getByRole("menuitem", { name: "Manage Events" })).toHaveAttribute("href", "/organizer/events");
    await expect(menu.getByRole("menuitem", { name: "Exhibitor Dashboard" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Platform Dashboard" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Become an Organizer" })).toHaveCount(0);

    await menu.getByRole("menuitem", { name: "Organizer Dashboard" }).click();
    await expect(page).toHaveURL(/\/organizer$/);
  });

  test("scanner role is only offered the dashboard, not create/manage links", async ({ page }) => {
    await loginAs(page, "org1.scanner@eventpass.test");
    const menu = await openProfileMenu(page);

    await expect(menu.getByText("Organizer · Scanner")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Organizer Dashboard" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Create an Exhibition" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Manage Events" })).toHaveCount(0);
  });

  test("exhibitor owner sees only the exhibitor dashboard", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    const menu = await openProfileMenu(page);

    await expect(menu.getByText("Exhibitor · Owner")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Exhibitor Dashboard" })).toHaveAttribute("href", "/exhibitor-dashboard");
    await expect(menu.getByRole("menuitem", { name: "Organizer Dashboard" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Become an Organizer" })).toHaveCount(0);
    // CSS locator on purpose: the open menu hides the rest of the page from role queries.
    await expect(page.locator('footer a[href="/exhibitor-dashboard"]')).toHaveCount(1);
  });

  test("platform admin sees the platform dashboard and no organizer links", async ({ page }) => {
    await loginAs(page, "platform.admin@eventpass.test");
    const menu = await openProfileMenu(page);

    await expect(menu.getByText("Platform Admin")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Platform Dashboard" })).toHaveAttribute("href", "/platform");
    await expect(menu.getByRole("menuitem", { name: "Organizer Dashboard" })).toHaveCount(0);
  });

  test("plain visitor is offered Become an Organizer and reaches the create page", async ({ page }) => {
    await loginAs(page, "visitor01@eventpass.test");
    const menu = await openProfileMenu(page);

    await expect(menu.getByRole("menuitem", { name: "Booking History" })).toHaveAttribute("href", "/my-tickets");
    await expect(menu.getByRole("menuitem", { name: "Inbox" })).toHaveAttribute("href", "/notifications");
    await expect(menu.getByRole("menuitem", { name: "Saved Events" })).toHaveAttribute("href", "/saved-events");
    await expect(menu.getByRole("menuitem", { name: "Organizer Dashboard" })).toHaveCount(0);

    // The footer must not advertise a dashboard this account can't open.
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator('footer a[href="/exhibitor-dashboard"]')).toHaveCount(0);

    await menu.getByRole("menuitem", { name: "Become an Organizer" }).click();
    await expect(page).toHaveURL(/\/host\/exhibitions\/new$/);
    await expect(page.getByRole("heading", { name: "List Your Exhibition" })).toBeVisible();
  });

  test("every account menu link resolves to a real page", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await openProfileMenu(page);
    const hrefs = (await menuHrefs(page)).filter((h) => h.startsWith("/"));
    expect(hrefs.length).toBeGreaterThan(5);

    for (const href of new Set(hrefs)) {
      await page.goto(href);
      // Lazy-loaded pages can take a while to compile on a cold dev server, so
      // wait for the page shell (site header or dashboard sidebar) rather than
      // network idle, which some pages never reach because they poll.
      await expect(page.locator("header, aside").first()).toBeVisible({ timeout: 60_000 });
      await expect(page, `${href} should not redirect away`).toHaveURL(new RegExp(`${href}$`));
      await expect(page.getByRole("heading", { name: "404" }), `${href} should not 404`).toHaveCount(0);
      await expect(page.getByText("Access Denied"), `${href} should not be denied`).toHaveCount(0);
    }
  });

  test("logged-out List Your Exhibition link signs in first and returns to the create page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "List Your Exhibition" }).first()).toHaveAttribute(
      "href",
      "/auth?redirect=%2Fhost%2Fexhibitions%2Fnew",
    );
  });
});

test.describe("Organizer sidebar", () => {
  test("only links to pages that exist, and Registrations opens", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await page.goto("/organizer");

    const nav = page.locator("aside nav");
    await expect(nav.getByRole("link", { name: "Marketing" })).toHaveAttribute("href", "/organizer/marketing");

    await nav.getByRole("link", { name: "Registrations" }).click();
    await expect(page).toHaveURL(/\/organizer\/registrations$/);
    await expect(page.getByRole("heading", { name: "404" })).toHaveCount(0);
  });
});

test.describe("Account settings", () => {
  test("shows the signed-in profile and rejects a mismatched password confirmation", async ({ page }) => {
    await loginAs(page, "visitor01@eventpass.test");
    await page.goto("/account/settings");

    await expect(page.getByRole("heading", { name: "Account Settings" })).toBeVisible();
    await expect(page.locator("#account-email")).toHaveValue("visitor01@eventpass.test");

    await page.locator("#current-password").fill(PASSWORD);
    await page.locator("#new-password").fill("BrandNewPass456$");
    await page.locator("#confirm-password").fill("DifferentPass789$");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("New passwords do not match")).toBeVisible();
  });
});
