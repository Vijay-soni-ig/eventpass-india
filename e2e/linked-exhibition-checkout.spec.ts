import { test, expect, type Page } from "@playwright/test";

const linkedTicketResponse = (enabled: boolean) => ({
  event: {
    id: "linked-event",
    title: "Linked Exhibition Showcase",
    startDate: "2027-06-01T00:00:00.000Z",
    endDate: "2027-06-03T00:00:00.000Z",
    timezone: "Asia/Kolkata",
    venue: "ExhibitTix Convention Centre",
    city: "Ahmedabad",
    coverImageUrl: null,
  },
  ticketTypes: [{
    id: "legacy-ticket",
    eventTicketTypeId: "canonical-event-ticket",
    name: "Visitor Pass",
    description: null,
    price: 250,
    currency: "INR",
    capacity: 10,
    maxPerOrder: 5,
    maxPerAttendee: null,
    remaining: 10,
    soldOut: false,
  }],
  legacyExhibitionId: "legacy-exhibition",
  linkedEventCheckoutEnabled: enabled,
});

async function mockLinkedTicketCatalog(page: Page, enabled: boolean) {
  await page.route("**/api/public/events/linked-event/tickets", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(linkedTicketResponse(enabled)),
    }),
  );
  await page.route(/\\/api\\/pricing\\/quote\\?baseAmount=(0|250)$/, (route) => {
    const baseAmount = Number(new URL(route.request().url()).searchParams.get("baseAmount") ?? 0);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ breakdown: {
        baseAmount,
        platformFeeAmount: baseAmount > 0 ? 25 : 0,
        gatewayFeeAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: baseAmount > 0 ? baseAmount + 25 : 0,
        organizerAmount: baseAmount,
        platformRevenueAmount: baseAmount > 0 ? 25 : 0,
        pricingVersionId: "pricing-version-test",
        feePaidBy: "attendee",
      } }),
    });
  });
}

test("enabled linked Exhibition checkout stays on Event reservations and requires a visit date", async ({ page }) => {
  await mockLinkedTicketCatalog(page, true);
  await page.goto("/event/linked-event/tickets?ticket=legacy-ticket");

  await expect(page.getByText("Linked Exhibition Showcase")).toBeVisible();
  await expect(page.getByText("₹275")).toBeVisible();
  const visitDate = page.getByLabel("Visit date");
  await expect(visitDate).toBeVisible();
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueButton).toBeDisabled();

  await visitDate.fill("2027-06-01");
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(page).toHaveURL(/\/auth\?redirect=/);
  const redirect = new URL(page.url()).searchParams.get("redirect") ?? "";
  expect(redirect).toContain("visitDate=2027-06-01");
  expect(redirect).toContain("quantity=1");
  await expect(page).not.toHaveURL(/\/book\/legacy-exhibition/);
});

test("a sold-out preselected Exhibition ticket is not silently replaced", async ({ page }) => {
  const response = linkedTicketResponse(true);
  response.ticketTypes = [
    { ...response.ticketTypes[0], soldOut: true, remaining: 0 },
    { ...response.ticketTypes[0], id: "alternate-legacy-ticket", eventTicketTypeId: "alternate-event-ticket", name: "Alternate Pass" },
  ];
  await page.route("**/api/public/events/linked-event/tickets", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) }),
  );
  await page.goto("/event/linked-event/tickets?ticket=legacy-ticket");

  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueButton).toBeDisabled();
  await page.getByRole("button", { name: /Alternate Pass/ }).click();
  await expect(continueButton).toBeDisabled();
  await page.getByLabel("Visit date").fill("2027-06-01");
  await expect(continueButton).toBeEnabled();
});

test("disabled linked Exhibition checkout preserves the legacy BookingFlow fallback", async ({ page }) => {
  await mockLinkedTicketCatalog(page, false);
  await page.goto("/event/linked-event/tickets?ticket=legacy-ticket");

  await expect(page.getByText("Linked Exhibition Showcase")).toBeVisible();
  await expect(page.getByLabel("Visit date")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page).toHaveURL(/\/book\/legacy-exhibition\?ticket=legacy-ticket/);
});
