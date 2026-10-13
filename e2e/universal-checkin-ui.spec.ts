import { createHmac } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const EVENT_TITLE = "E2E Lead Capture Expo 2026";

async function loginAsOrganizer(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: "org1.owner@eventpass.test", password: PASSWORD },
  });
  expect(response.ok(), `organizer login failed: ${await response.text()}`).toBeTruthy();
  const payload = await response.json();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

function qrPayload(ticketId: string, ticketCode: string) {
  const secret = process.env.TICKET_QR_SECRET || process.env.JWT_SECRET || "ci-test-secret";
  const signature = createHmac("sha256", secret).update(ticketId + "." + ticketCode).digest("base64url");
  return `ETX1.${ticketCode}.${signature}`;
}

test.describe("Universal event check-in scanner UI", () => {
  test("requires an event, rejects invalid QR payloads, and explains duplicate check-ins", async ({ page }) => {
    await loginAsOrganizer(page);
    await page.goto("/organizer/checkin");

    await expect(page.getByRole("heading", { name: "Check-in", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Manual" }).click();
    const payloadInput = page.getByRole("textbox", { name: "QR payload" });
    const submit = page.getByRole("button", { name: "Validate & Check In" });
    await expect(submit).toBeDisabled();

    await page.getByRole("combobox", { name: "Event" }).click();
    await page.getByRole("option", { name: EVENT_TITLE }).click();
    await expect(submit).toBeDisabled();

    await payloadInput.fill("not-a-valid-ticket-payload");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByRole("heading", { name: "Check-in Rejected" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Check-in Rejected" }).locator("xpath=..").getByText("Invalid or unrecognized ticket QR code", { exact: true })).toBeVisible();

    // The signed fixture belongs to EVENT_TITLE. Selecting a different event must
    // surface the server's event-mismatch rejection before any ticket state is changed.
    await page.getByRole("combobox", { name: "Event" }).click();
    await page.getByRole("option", { name: "E2E Public Conference 2026" }).click();
    await payloadInput.fill(qrPayload("e2e-lead-ticket-used-001", "ETX-E2E-USED-001"));
    const mismatchResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/event-ticket-check-ins") &&
      response.request().method() === "POST",
    );
    await submit.click();
    const mismatchResponse = await mismatchResponsePromise;
    expect(mismatchResponse.status()).toBe(409);
    expect(await mismatchResponse.json()).toMatchObject({
      error: "This ticket belongs to a different event",
    });
    await expect(page.getByRole("heading", { name: "Check-in Rejected" })).toBeVisible();
    await expect(page.getByText("This ticket belongs to a different event", { exact: true })).toBeVisible();

    // Restore the owning event. This deterministic fixture is already USED.
    // Scanning it must never grant entry again.
    await page.getByRole("combobox", { name: "Event" }).click();
    await page.getByRole("option", { name: EVENT_TITLE }).click();
    await payloadInput.fill(qrPayload("e2e-lead-ticket-used-001", "ETX-E2E-USED-001"));
    await submit.click();
    await expect(page.getByRole("heading", { name: "Already Checked In" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Already Checked In" }).locator("xpath=..").getByText("This ticket has already been checked in", { exact: true })).toBeVisible();
    await expect(page.getByText("ETX-E2E-USED-001")).toHaveCount(0);
  });
});
