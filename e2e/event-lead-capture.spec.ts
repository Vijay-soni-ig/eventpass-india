import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";

const EVENT_ID = "e2e-lead-event-001";
function qrPayload(ticketId: string, ticketCode: string) {\n  const token = crypto.createHmac("sha256", process.env.TICKET_QR_SECRET || "ci-test-secret").update(ticketId + "." + ticketCode).digest("base64url");\n  return `ETX1.${ticketCode}.${token}`;\n}\n\nconst USED_QR = qrPayload("e2e-lead-ticket-used-001", "ETX-E2E-USED-001");\nconst ACTIVE_QR = qrPayload("e2e-lead-ticket-active-001", "ETX-E2E-ACTIVE-001");
const BIZ1_EMAIL = "biz1.staff@eventpass.test";
const BIZ2_EMAIL = "biz2.owner@eventpass.test";
const PASSWORD = "DevPassword123!";

async function login(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
}

test.describe("Universal exhibitor lead capture", () => {
  test("captures a checked-in visitor and remains idempotent on repeat", async ({ page }) => {
    await login(page, BIZ1_EMAIL);
    await page.goto("/exhibitor-dashboard/leads/capture");

    await expect(page.getByRole("heading", { name: "Capture Visitor Lead" })).toBeVisible();
    await page.getByRole("combobox", { name: "Event / Exhibition" }).click();
    await page.getByText("E2E Lead Capture Expo 2026").click();

    await page.getByRole("tab", { name: "Manual" }).click();
    await page.getByPlaceholder("Paste the ticket QR payload").fill(USED_QR);
    await page.getByRole("button", { name: "Capture Lead" }).click();

    await expect(page.getByText("Lead Captured")).toBeVisible();

    await page.getByPlaceholder("Paste the ticket QR payload").fill(USED_QR);
    await page.getByRole("button", { name: "Capture Lead" }).click();
    await expect(page.getByText("Lead Already Captured")).toBeVisible();

    const leads = await page.request.get("/api/event-leads?eventId=" + EVENT_ID);
    expect(leads.ok()).toBeTruthy();
    const payload = await leads.json();
    expect(payload.leads.filter((lead: { ticketId: string }) => lead.ticketId === "e2e-lead-ticket-used-001")).toHaveLength(1);
  });

  test("rejects a valid but not checked-in ticket", async ({ page }) => {
    await login(page, BIZ1_EMAIL);
    await page.goto("/exhibitor-dashboard/leads/capture");
    await page.getByRole("combobox", { name: "Event / Exhibition" }).click();
    await page.getByText("E2E Lead Capture Expo 2026").click();
    await page.getByRole("tab", { name: "Manual" }).click();
    await page.getByPlaceholder("Paste the ticket QR payload").fill(ACTIVE_QR);
    await page.getByRole("button", { name: "Capture Lead" }).click();

    await expect(page.getByText("Capture Failed")).toBeVisible();
    const leads = await page.request.get("/api/event-leads?eventId=" + EVENT_ID);
    expect((await leads.json()).leads.filter((lead: { ticketId: string }) => lead.ticketId === "e2e-lead-ticket-active-001")).toHaveLength(0);
  });

  test("does not expose capture contexts to an exhibitor without confirmed participation", async ({ page }) => {
    await login(page, BIZ2_EMAIL);
    await page.goto("/exhibitor-dashboard/leads/capture");
    await expect(page.getByText("No lead capture events")).toBeVisible();
  });

  test("rejects a wrong-event QR at the authoritative resolver", async ({ page }) => {
    await login(page, BIZ1_EMAIL);
    const response = await page.request.post("/api/event-leads/capture-contexts/resolve-qr", {
      data: { eventId: "e2e-wrong-event-001", qrPayload: USED_QR },
    });
    expect(response.status()).toBe(404);
  });
});
