import { test, expect } from "@playwright/test";

const PLATFORM_ADMIN_EMAIL = "platform.admin@eventpass.test";
const PLATFORM_ADMIN_PASSWORD = "DevPassword123!";

test.describe("Platform admin authentication routing", () => {
  test("platform admin lands in the platform control plane", async ({ page, request }) => {
    const login = await request.post("/api/auth/login", {
      data: {
        email: PLATFORM_ADMIN_EMAIL,
        password: PLATFORM_ADMIN_PASSWORD,
      },
    });

    expect(login.status(), `platform admin login failed: ${await login.text()}`).toBe(200);

    const body = await login.json();
    expect(body.user.platformRole).toBe("super_admin");
    expect(body.user.roles.platformAdmin).toBe(true);

    await page.addInitScript((token) => {
      localStorage.setItem("eventpass_token", token);
    }, body.token);

    await page.goto("/auth");
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole("heading", { name: "Platform Dashboard", exact: true })).toBeVisible();
  });

  test("platform admin can manage event categories end-to-end", async ({ page, request }) => {
    const login = await request.post("/api/auth/login", {
      data: { email: PLATFORM_ADMIN_EMAIL, password: PLATFORM_ADMIN_PASSWORD },
    });
    expect(login.status(), `platform admin login failed: ${await login.text()}`).toBe(200);
    const body = await login.json();
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), body.token);
    await page.goto("/platform/event-categories");
    await expect(page).toHaveURL(/\/platform\/event-categories$/);
    await expect(page.getByRole("heading", { name: "Event Categories" })).toBeVisible();

    const suffix = Date.now().toString();
    const categoryName = `E2E Category ${suffix}`;
    const categorySlug = `e2e-category-${suffix}`;

    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const dialog = page.getByRole("dialog");
    const textboxes = dialog.getByRole("textbox");
    await textboxes.nth(0).fill(categoryName);
    await textboxes.nth(1).fill(categorySlug);
    await page.getByRole("dialog").getByRole("button", { name: "Create category" }).click();

    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    // Verify creation is persisted by the server, not just reflected in client state.
    await page.reload();
    await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

    const categoryRow = page.locator("div.rounded-lg.border").filter({ hasText: categoryName }).first();
    await expect(categoryRow).toBeVisible();
    await expect(categoryRow.getByText("Active", { exact: true })).toBeVisible();

    await categoryRow.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive" }).click();

    // Archived categories are intentionally excluded from the default active-only list.
    await expect(page.getByText(categoryName, { exact: true })).toHaveCount(0);
    // Reload to prove the archive state persisted in the backend.
    await page.reload();
    await page.getByLabel("Show archived").check();
    await page.getByPlaceholder("Search name, slug or description...").fill(categorySlug);

    const archivedCategoryRow = page.locator("div.rounded-lg.border").filter({ hasText: categoryName }).first();
    await expect(archivedCategoryRow.getByText("Archived", { exact: true })).toBeVisible();
    await archivedCategoryRow.getByRole("button", { name: "Restore" }).click();
    await expect(archivedCategoryRow.getByText("Active", { exact: true })).toBeVisible();

    // Restored status must also survive a fresh page load.
    await page.reload();
    const restoredCategoryRow = page.locator("div.rounded-lg.border").filter({ hasText: categoryName }).first();
    await expect(restoredCategoryRow.getByText("Active", { exact: true })).toBeVisible();
  });

  test("visitor cannot access protected platform pages by direct URL", async ({ page, request }) => {
    const suffix = Date.now().toString();
    const signup = await request.post("/api/auth/signup", {
      data: {
        email: `platform-route-visitor-${suffix}@example.com`,
        password: "TestPassword123!",
        fullName: "Platform Route Visitor",
        userType: "visitor",
      },
    });

    expect(signup.ok(), `visitor signup failed: ${await signup.text()}`).toBeTruthy();
    const body = await signup.json();
    expect(body.token).toBeTruthy();
    expect(body.user.platformRole).not.toBe("super_admin");
    expect(body.user.roles?.platformAdmin).not.toBe(true);

    // UI route guards are not an authorization boundary. Verify the same visitor
    // cannot call platform APIs directly with a valid visitor session.
    const authorization = { Authorization: `Bearer ${body.token}` };
    const categoriesApi = await request.get("/api/platform/event-categories", { headers: authorization });
    expect(categoriesApi.status(), `visitor must not read platform categories: ${await categoriesApi.text()}`).toBe(403);
    expect((await categoriesApi.json()).error).toBe("Platform admin access required");

    const settingsApi = await request.get("/api/platform/settings", { headers: authorization });
    expect(settingsApi.status(), `visitor must not read platform settings: ${await settingsApi.text()}`).toBe(403);
    expect((await settingsApi.json()).error).toBe("Platform admin access required");

    // Authorization must also hold for writes; hiding admin controls in the UI
    // is not enough to protect platform configuration or category management.
    const createCategoryApi = await request.post("/api/platform/event-categories", {
      headers: authorization,
      data: {
        name: `Unauthorized Visitor Category ${suffix}`,
        slug: `unauthorized-visitor-category-${suffix}`,
      },
    });
    expect(createCategoryApi.status(), `visitor must not create platform categories: ${await createCategoryApi.text()}`).toBe(403);
    expect((await createCategoryApi.json()).error).toBe("Platform admin access required");

    const updateSettingsApi = await request.patch("/api/platform/settings", {
      headers: authorization,
      data: { siteName: "Unauthorized visitor mutation" },
    });
    expect(updateSettingsApi.status(), `visitor must not update platform settings: ${await updateSettingsApi.text()}`).toBe(403);
    expect((await updateSettingsApi.json()).error).toBe("Platform admin access required");

    await page.addInitScript((token) => {
      localStorage.setItem("eventpass_token", token);
    }, body.token);

    await page.goto("/platform/event-categories");
    await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Event Categories" })).toHaveCount(0);
  });

  test("legacy platformAdmin flag cannot bypass the canonical platformRole route guard", async ({ page, request }) => {
    const suffix = Date.now().toString();
    const signup = await request.post("/api/auth/signup", {
      data: {
        email: `platform-route-legacy-role-${suffix}@example.com`,
        password: "TestPassword123!",
        fullName: "Platform Route Legacy Role",
        userType: "visitor",
      },
    });

    expect(signup.ok(), `visitor signup failed: ${await signup.text()}`).toBeTruthy();
    const body = await signup.json();
    expect(body.user.platformRole).not.toBe("super_admin");

    await page.addInitScript((token) => {
      localStorage.setItem("eventpass_token", token);
    }, body.token);
    await page.route("**/api/auth/me", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.user.platformRole = null;
      payload.user.roles = { ...payload.user.roles, platformAdmin: true };
      await route.fulfill({ response, body: JSON.stringify(payload) });
    });

    await page.goto("/platform/event-categories");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Event Categories" })).toHaveCount(0);
  });

  test("legacy platformAdmin flag cannot bypass organizer route authorization", async ({ page, request }) => {
    const suffix = Date.now().toString();
    const signup = await request.post("/api/auth/signup", {
      data: {
        email: `organizer-route-legacy-role-${suffix}@example.com`,
        password: "TestPassword123!",
        fullName: "Organizer Route Legacy Role",
        userType: "visitor",
      },
    });

    expect(signup.ok(), `visitor signup failed: ${await signup.text()}`).toBeTruthy();
    const body = await signup.json();
    expect(body.user.platformRole).not.toBe("super_admin");

    await page.addInitScript((token) => {
      localStorage.setItem("eventpass_token", token);
    }, body.token);
    await page.route("**/api/auth/me", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.user.platformRole = null;
      payload.user.roles = { ...payload.user.roles, platformAdmin: true };
      await route.fulfill({ response, body: JSON.stringify(payload) });
    });

    await page.goto("/organizer");
    await expect(page.getByRole("heading", { name: /access denied/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /organizer dashboard/i })).toHaveCount(0);
  });

  test("platform reports uses report tabs without duplicate category cards", async ({ page, request }) => {
    const login = await request.post("/api/auth/login", {
      data: { email: PLATFORM_ADMIN_EMAIL, password: PLATFORM_ADMIN_PASSWORD },
    });
    expect(login.status(), `platform admin login failed: ${await login.text()}`).toBe(200);
    const body = await login.json();
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), body.token);

    await page.goto("/platform/reports");
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Report Categories", exact: true })).toHaveCount(0);
    const tabs = page.getByRole("tablist");
    await expect(tabs.getByRole("tab", { name: "Revenue" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "Payments" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "Platform Activity" })).toBeVisible();
    await tabs.getByRole("tab", { name: "Organizers" }).click();
    await expect(page.getByRole("heading", { name: "Organizer Report" })).toBeVisible();
  });

  test("platform settings shows a retryable error when settings fail to load", async ({ page, request }) => {
    const login = await request.post("/api/auth/login", {
      data: { email: PLATFORM_ADMIN_EMAIL, password: PLATFORM_ADMIN_PASSWORD },
    });
    expect(login.status(), `platform admin login failed: ${await login.text()}`).toBe(200);
    const body = await login.json();

    await page.addInitScript((token) => {
      localStorage.setItem("eventpass_token", token);
    }, body.token);
    let settingsRequests = 0;
    await page.route("**/api/platform/settings**", async (route) => {
      settingsRequests += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Settings unavailable" }),
      });
    });

    await page.goto("/platform/settings");
    // React Query retries transient failures before rendering the terminal error state.
    await expect(page.getByText("Couldn't load platform settings.")).toBeVisible({ timeout: 15_000 });
    const attemptsBeforeRetry = settingsRequests;
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => settingsRequests, { timeout: 5_000 }).toBeGreaterThan(attemptsBeforeRetry);
    // The intercepted request counter advances before React Query finishes its retry
    // lifecycle. Wait for the retry control itself to return before asserting the terminal
    // error message, rather than accepting a possibly stale description during refetch.
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Couldn't load platform settings.")).toBeVisible({ timeout: 15_000 });
  });


  test("event category pagination uses real buttons and disables boundary actions", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { email: PLATFORM_ADMIN_EMAIL, password: PLATFORM_ADMIN_PASSWORD },
    });
    expect(login.status(), await login.text()).toBe(200);
    const body = await login.json();
    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), body.token);

    const requestedPages: string[] = [];
    await page.route("**/api/platform/event-categories?*", async (route) => {
      const url = new URL(route.request().url());
      const requestedPage = url.searchParams.get("page") ?? "1";
      requestedPages.push(requestedPage);
      const start = (Number(requestedPage) - 1) * 25;
      const categories = Array.from({ length: requestedPage === "1" ? 25 : 1 }, (_, index) => ({
        id: `e2e-pagination-${start + index + 1}`,
        name: `Pagination Category ${start + index + 1}`,
        slug: `pagination-category-${start + index + 1}`,
        description: null,
        parentCategoryId: null,
        active: true,
        sortOrder: start + index + 1,
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ categories, total: 26, page: Number(requestedPage), pageSize: 25 }),
      });
    });

    await page.goto("/platform/event-categories");
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    const previous = page.getByRole("button", { name: "Go to previous page" });
    const next = page.getByRole("button", { name: "Go to next page" });
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.getByText("Pagination Category 26", { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();
    await previous.click();
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
    expect(requestedPages).toContain("2");
  });

});
