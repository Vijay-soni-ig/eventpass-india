import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "TestPassword123!";
const ORGANIZER_EMAIL = "org1.owner@eventpass.test";
const EXHIBITION_ID = "e2e-guided-stall-booking-exhibition-001";

async function login(page: Page, email: string, password: string) {
  const response = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  expect(body.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), body.token);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document, `document overflowed at ${dimensions.viewport}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, `body overflowed at ${dimensions.viewport}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("approved exhibitor reviews the reserved stall and only confirms after server-verified payment", async ({ page }) => {
  const suffix = randomUUID();
  const organizerLogin = await page.request.post("/api/auth/login", {
    data: { email: ORGANIZER_EMAIL, password: "DevPassword123!" },
  });
  expect(organizerLogin.status(), await organizerLogin.text()).toBe(200);
  const organizer = await organizerLogin.json();
  const organizerHeaders = { Authorization: `Bearer ${organizer.token}` };

  const stallResponse = await page.request.post(`/api/exhibitions/${EXHIBITION_ID}/stalls`, {
    headers: organizerHeaders,
    data: { code: `P3-${suffix.slice(0, 8)}`, stallType: "standard", size: "3m x 3m", price: 12500 },
  });
  expect(stallResponse.status(), await stallResponse.text()).toBe(201);
  const stall = (await stallResponse.json()).stall;

  const addOnResponse = await page.request.post(`/api/exhibitions/${EXHIBITION_ID}/add-ons`, {
    headers: organizerHeaders,
    data: {
      name: `Power connection ${suffix.slice(0, 8)}`,
      description: "Dedicated electrical connection",
      price: 250,
      maxQuantityPerBooking: 2,
    },
  });
  expect(addOnResponse.status(), await addOnResponse.text()).toBe(201);
  const addOn = (await addOnResponse.json()).addOn;

  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `phase3-${suffix}@example.com`,
      password: PASSWORD,
      fullName: "Phase 3 Booking Exhibitor",
      userType: "exhibitor",
    },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const exhibitor = await signup.json();

  const application = await page.request.post("/api/exhibitor/participations", {
    headers: { Authorization: `Bearer ${exhibitor.token}` },
    data: { exhibitionId: EXHIBITION_ID },
  });
  expect(application.status(), await application.text()).toBe(201);
  const participation = (await application.json()).participation;

  const approval = await page.request.patch(
    `/api/exhibitions/${EXHIBITION_ID}/exhibitors/${participation.id}`,
    { headers: organizerHeaders, data: { status: "approved" } },
  );
  expect(approval.status(), await approval.text()).toBe(200);

  await login(page, `phase3-${suffix}@example.com`, PASSWORD);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/exhibitor-dashboard/participations");
  await expect(page.getByRole("heading", { name: "My Participations" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "Select Stall" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Select a Stall" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: new RegExp(stall.code) }).click();

  await expect(page.getByText("Stall reserved — proceed to payment")).toBeVisible();
  await page.getByRole("button", { name: "Review booking" }).click();
  const addOnPicker = page.getByRole("dialog");
  await expect(addOnPicker.getByRole("heading", { name: "Optional booking add-ons" })).toBeVisible();
  await addOnPicker.getByLabel("Quantity").fill("2");
  await addOnPicker.getByRole("button", { name: "Continue to booking review" }).click();
  const review = page.getByRole("dialog");
  await expect(review.getByRole("heading", { name: "Review your stall booking" })).toBeVisible();
  await expect(review.getByText("Price breakdown")).toBeVisible();
  await expect(review.getByText("Power connection", { exact: false })).toBeVisible();
  await expect(review.getByText("Booking subtotal")).toBeVisible();
  await expect(review.getByText("Total payable")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(review.getByText("Bengaluru Tech & Startup Expo 2026")).toBeVisible();
  await expect(review.getByText("Full refund up to 7 days before the event; no refunds within 7 days.")).toBeVisible();
  await expect(review.getByText("Standard exhibitor and visitor terms apply.")).toBeVisible();
  const continueButton = review.getByRole("button", { name: "Continue to payment" });
  await expect(continueButton).toBeDisabled();
  await review.getByLabel("I have read and agree to the booking terms.").check();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Test Payment Gateway" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate Success" }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
});
