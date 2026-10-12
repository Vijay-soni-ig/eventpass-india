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
  return payload.token as string;
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
      await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$")") + "(?:\\?.*)?$"));
    });
  }
}

test.describe("Dashboard sidebar navigation audit", () => {
  test("organizer owner can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await auditVisibleSidebarLinks(page, "/organizer");
  });

  test("organizer dashboard quick actions navigate to their real destinations", async ({ page }) => {
    await loginAs(page, "org1.owner@eventpass.test");
    await page.goto("/organizer");
    const quickActions = page.locator('section[aria-labelledby="quick-actions-heading"]');
    await expect(quickActions).toBeVisible();

    const expectedDestinations = [
      { label: "Create Event", path: "/organizer/events/new" },
      { label: "Manage Exhibitors", path: "/organizer/exhibitors" },
      { label: "Manage Tickets", path: "/organizer/tickets" },
      { label: "Check-in Scanner", path: "/organizer/checkin" },
      { label: "Payments", path: "/organizer/payments" },
      // The legacy analytics shortcut intentionally redirects to the canonical event analytics route.
      { label: "Analytics", path: "/organizer/event-analytics" },
    ];

    for (const destination of expectedDestinations) {
      await test.step(`quick action ${destination.label} opens ${destination.path}`, async () => {
        const action = quickActions.getByRole("link", { name: new RegExp(destination.label) });
        await expect(action).toBeVisible();
        await action.click();
        await expect(page).toHaveURL(new RegExp(destination.path + "$"));
        await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
        await expect(page.getByText("Access Denied", { exact: true })).toHaveCount(0);
        await expect(page.locator("aside nav")).toBeVisible();
        await page.goto("/organizer");
        await expect(quickActions).toBeVisible();
      });
    }
  });

  test("exhibitor owner can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await auditVisibleSidebarLinks(page, "/exhibitor-dashboard");
  });

  test("exhibitor dashboard actions open profile, exhibition list, and the correct empty/populated state", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard");
    await expect(page.getByText(/enable payouts/i)).toHaveCount(0);

    const completeProfile = page.getByRole("link", { name: "Complete", exact: true });
    if (await completeProfile.isVisible().catch(() => false)) {
      await completeProfile.click();
      await expect(page).toHaveURL(/\/exhibitor-dashboard\/business\/profile$/);
      await expect(page.locator("aside nav")).toBeVisible();
      await page.goto("/exhibitor-dashboard");
    }

    const viewAll = page.getByRole("link", { name: /View All/ });
    await expect(viewAll).toBeVisible();
    await viewAll.click();
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/exhibitions$/);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
    await expect(page.getByText("Access Denied", { exact: true })).toHaveCount(0);

    await page.goto("/exhibitor-dashboard");
    const confirmedRows = page.locator('a[href="/exhibitor-dashboard/participations"]');
    if (await confirmedRows.count()) {
      await confirmedRows.first().click();
      await expect(page).toHaveURL(/\/exhibitor-dashboard\/participations$/);
      await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
    } else {
      const browse = page.getByRole("link", { name: /Browse Exhibitions/ });
      await expect(browse).toBeVisible();
      await browse.click();
      await expect(page).toHaveURL(/\/exhibitions$/);
      await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
    }
  });

  test("company profile validates required fields and Cancel restores unsaved edits", async ({ page }) => {
    const token = await loginAs(page, "biz1.owner@eventpass.test");
    const auth = { Authorization: `Bearer ${token}` };
    const beforeResponse = await page.request.get("/api/business", { headers: auth });
    expect(beforeResponse.status(), await beforeResponse.text()).toBe(200);
    const before = (await beforeResponse.json()).business;
    expect(before).toBeTruthy();

    await page.goto("/exhibitor-dashboard/business/profile");
    await expect(page.getByRole("heading", { name: "Company Profile" })).toBeVisible();

    await page.getByLabel("Company Name *").fill("   ");
    await page.getByLabel("Business Address *").fill("   ");
    await page.getByLabel("GST Number *").fill("");
    await page.getByLabel("PAN Number *").fill("");
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByText(/Please complete the required fields: Company Name, Business Address, GST Number, PAN Number\./)).toBeVisible();
    await expect(page.getByLabel("Company Name *")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Business Address *")).toHaveAttribute("aria-invalid", "true");

    const afterInvalidResponse = await page.request.get("/api/business", { headers: auth });
    expect(afterInvalidResponse.status()).toBe(200);
    expect((await afterInvalidResponse.json()).business.companyName).toBe(before.companyName);

    await page.getByLabel("Company Name *").fill("Unsaved temporary company name");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Company Name *")).toHaveValue(before.companyName ?? "");
    await expect(page.getByLabel("Company Name *")).not.toHaveAttribute("aria-invalid", "true");
  });

  test("company logo upload rejects unsupported types and files larger than 2MB before sending", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");
    await page.goto("/exhibitor-dashboard/business/profile");
    const fileInput = page.getByTestId("company-logo-input");

    await fileInput.setInputFiles({
      name: "not-an-image.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("GIF89a"),
    });
    await expect(page.getByText("Choose a PNG, JPG, or WebP image.")).toBeVisible();

    await fileInput.setInputFiles({
      name: "oversized.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    });
    await expect(page.getByText("Logo must be 2MB or smaller.")).toBeVisible();
    await expect(page.getByText("Uploading...")).toHaveCount(0);
  });

  test("exhibitor business pages do not promise unavailable payouts", async ({ page }) => {
    await loginAs(page, "biz1.owner@eventpass.test");

    await page.goto("/exhibitor-dashboard");
    await expect(page.getByText(/enable payouts/i)).toHaveCount(0);
    await expect(page.getByText(/payout processing is not available yet/i)).toHaveCount(0);

    await page.goto("/exhibitor-dashboard/business/profile");
    await expect(page.getByRole("heading", { name: "Company Profile" })).toBeVisible();
    await expect(page.getByText(/enable all features including payouts/i)).toHaveCount(0);
    await expect(page.getByText(/payouts will be processed/i)).toHaveCount(0);
    await expect(page.getByText(/details will be reviewed before payouts begin/i)).toHaveCount(0);
  });

  test("platform admin can open every visible sidebar destination", async ({ page }) => {
    await loginAs(page, "platform.admin@eventpass.test");
    await auditVisibleSidebarLinks(page, "/platform");
  });
});
