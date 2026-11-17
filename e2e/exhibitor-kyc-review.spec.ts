import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "TestPassword123!";
const PLATFORM_ADMIN_EMAIL = "platform.admin@eventpass.test";
const PLATFORM_ADMIN_PASSWORD = "DevPassword123!";

async function login(page: Page, email: string, password: string) {
  const response = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  expect(body.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), body.token);
}

test("exhibitor submits KYC documents and Super Admin reviews and verifies them", async ({ page, browser }) => {
  const suffix = Date.now().toString();
  const email = `kyc-e2e-${suffix}@example.com`;
  const signup = await page.request.post("/api/auth/signup", {
    data: { email, password: PASSWORD, fullName: "KYC E2E Exhibitor", userType: "exhibitor" },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const account = await signup.json();
  const onboarding = await page.request.get("/api/onboarding", { headers: { Authorization: `Bearer ${account.token}` } });
  expect(onboarding.status(), await onboarding.text()).toBe(200);

  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), account.token);
  await page.goto("/exhibitor-dashboard/documents");
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Document category").selectOption("gst_certificate");
  await page.locator('input[type="file"][aria-label="Choose a PDF or image document"]').setInputFiles({
    name: "gst-certificate.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nKYC E2E fixture"),
  });
  await expect(page.getByText("gst-certificate.pdf")).toBeVisible();
  await page.getByRole("button", { name: "Submit KYC for review" }).click();
  await expect(page.getByText(/Exhibitor KYC: submitted/i)).toBeVisible();

  const adminContext = await browser.newContext({ baseURL: "http://127.0.0.1:8080" });
  const adminPage = await adminContext.newPage();
  await login(adminPage, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD);
  await adminPage.goto("/platform/exhibitors/kyc-review");
  await expect(adminPage.getByRole("heading", { name: "Exhibitor KYC Review" })).toBeVisible();
  await adminPage.getByRole("textbox", { name: "Search exhibitor KYC queue" }).fill(email);
  const queueRow = adminPage.locator("div.rounded-xl.border").filter({ hasText: email }).first();
  await expect(queueRow).toBeVisible();
  await queueRow.getByRole("link", { name: "Review documents" }).click();

  await expect(adminPage.getByRole("heading", { name: "Unnamed business" })).toBeVisible();
  await adminPage.getByText("KYC E2E Exhibitor", { exact: true }).toBeVisible();
  await adminPage.getByRole("tab", { name: "KYC" }).click();
  await adminPage.getByRole("button", { name: "Start review" }).click();
  await expect(adminPage.getByText(/under review/i).first()).toBeVisible();
  await adminPage.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(adminPage.getByText("verified", { exact: false }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByText(/Exhibitor KYC: verified/i)).toBeVisible();
  await adminContext.close();
});
