import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const EXHIBITOR_EMAIL = "biz1.owner@eventpass.test";
const EXHIBITOR_STAFF_EMAIL = "biz1.staff@eventpass.test";

async function login(page: Page, email = EXHIBITOR_EMAIL) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  const responseBody = await response.text();
  expect(response.status(), `login failed for ${email}: ${responseBody}`).toBe(200);
  const payload = JSON.parse(responseBody);
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
  return payload.token as string;
}

test.describe("Exhibitor core screens", () => {
  test("dashboard loads usable content and navigation exposes Documents and Sales", async ({ page }) => {
    const ownerToken = await login(page);
    const paymentSummaryResponse = await page.request.get("/api/exhibitor/participations/payments", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(paymentSummaryResponse.status(), `Exhibitor Owner payment summary failed: ${await paymentSummaryResponse.text()}`).toBe(200);
    const paymentSummary = await paymentSummaryResponse.json();
    expect(Array.isArray(paymentSummary.bookings)).toBe(true);
    expect(paymentSummary.summary).toMatchObject({
      grossPaid: expect.any(Number),
      refundedAmount: expect.any(Number),
      netSpend: expect.any(Number),
      pendingAmount: expect.any(Number),
    });

    await page.goto("/exhibitor-dashboard");

    await expect(page.getByRole("heading", { name: "Exhibitor Dashboard", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Net Stall Spend", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirmed Stalls", { exact: true })).toBeVisible();

    const workspaceNav = page.getByRole("navigation", { name: "Workspace navigation" });
    await expect(workspaceNav.getByRole("link", { name: "Documents", exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(workspaceNav.getByRole("link", { name: "Sales", exact: true })).toBeVisible();

    await workspaceNav.getByRole("link", { name: "Sales", exact: true }).click();
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/sales$/);
    await expect(page.getByRole("heading", { name: "Sales", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Stall Payment History", { exact: true })
        .or(page.getByRole("heading", { name: "No stall payments yet", exact: true })),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Financial access restricted", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Could not load stall payments", exact: true })).toHaveCount(0);

    await workspaceNav.getByRole("link", { name: "Documents", exact: true }).click();
    await expect(page).toHaveURL(/\/exhibitor-dashboard\/documents$/);
    await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("group", { name: "Document status filter" })).toBeVisible();
  });

  test("Exhibitor Staff is denied financial Sales data in both API and UI", async ({ page }) => {
    const staffToken = await login(page, EXHIBITOR_STAFF_EMAIL);
    const response = await page.request.get("/api/exhibitor/participations/payments", {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(response.status(), await response.text()).toBe(403);

    const paymentRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/exhibitor/participations/payments")) paymentRequests.push(request.url());
    });
    await page.goto("/exhibitor-dashboard/sales");
    await expect(page.getByRole("heading", { name: "Financial access restricted", exact: true })).toBeVisible();
    expect(paymentRequests).toHaveLength(0);
  });

  test("Dashboard, Sales, and Documents direct routes survive refresh", async ({ page }) => {
    await login(page);

    const routes = [
      { path: "/exhibitor-dashboard", heading: "Exhibitor Dashboard" },
      { path: "/exhibitor-dashboard/sales", heading: "Sales" },
      { path: "/exhibitor-dashboard/documents", heading: "Documents" },
    ];

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible({ timeout: 15_000 });
      await page.reload();
      await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible({ timeout: 15_000 });
    }
  });


  test("scanner handles camera permission denial and manual entry remains available", async ({ page }) => {
    await login(page);
    await page.addInitScript(() => {
      if (!navigator.mediaDevices) return;
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      });
    });

    await page.goto("/exhibitor-dashboard/scanner");
    await expect(page.getByText("Camera permission denied. Allow access in browser settings.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Manual", exact: true }).click();
    await expect(page.getByPlaceholder("Enter ticket QR code...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Check In", exact: true })).toBeDisabled();
  });

});