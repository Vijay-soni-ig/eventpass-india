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
}

test("enabled linked Exhibition checkout stays on Event reservations and requires a visit date", async ({ page }) => {
  await mockLinkedTicketCatalog(page, true);
  await page.goto("/event/linked-event/tickets?ticket=legacy-ticket");

  await expect(page.getByText("Linked Exhibition Showcase")).toBeVisible();
  const visitDate = page.getByLabel("Visit date");
  await expect(visitDate).toBeVisible();
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  await expect(continueButton).toBeDisabled();

  await visitDate.fill("2027-06-01");
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(page).toHaveURL(/\/auth\?redirect=/);
  await expect(page).not.toHaveURL(/\/book\/legacy-exhibition/);
});

test("disabled linked Exhibition checkout preserves the legacy BookingFlow fallback", async ({ page }) => {
  await mockLinkedTicketCatalog(page, false);
  await page.goto("/event/linked-event/tickets?ticket=legacy-ticket");

  await expect(page.getByText("Linked Exhibition Showcase")).toBeVisible();
  await expect(page.getByLabel("Visit date")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page).toHaveURL(/\/book\/legacy-exhibition\?ticket=legacy-ticket/);
});
