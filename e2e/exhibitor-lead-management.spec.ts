import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const OWNER_EMAIL = "biz1.owner@eventpass.test";
const OTHER_BUSINESS_EMAIL = "biz2.owner@eventpass.test";

async function login(page: Page, email: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(response.status(), `login failed for ${email}: ${await response.text()}`).toBe(200);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  return payload.token as string;
}

test.describe("Exhibitor lead management actions", () => {
  test("updates lead pipeline and follow-up fields, persists them, and isolates other businesses", async ({ page }) => {
    const ownerToken = await login(page, OWNER_EMAIL);
    const auth = { Authorization: `Bearer ${ownerToken}` };

    const participationsResponse = await page.request.get("/api/exhibitor/participations", { headers: auth });
    expect(participationsResponse.status(), await participationsResponse.text()).toBe(200);
    const participationsPayload = await participationsResponse.json();
    const participation = participationsPayload.participations.find(
      (item: { status: string }) => item.status === "confirmed",
    );
    expect(participation, "seeded exhibitor should have a confirmed participation").toBeTruthy();

    const suffix = Date.now();
    const createdResponse = await page.request.post("/api/leads", {
      headers: auth,
      data: {
        exhibitionExhibitorId: participation.id,
        visitorName: `E2E Lead ${suffix}`,
        visitorEmail: `e2e-lead-${suffix}@example.com`,
        visitorPhone: "+91 90000 12345",
        notes: "Initial E2E note",
        source: "manual",
        priority: "medium",
      },
    });
    expect(createdResponse.status(), `lead creation failed: ${await createdResponse.text()}`).toBe(201);
    const createdPayload = await createdResponse.json();
    const leadId = createdPayload.lead.id as string;
    expect(leadId).toBeTruthy();

    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), ownerToken);
    await page.goto(`/exhibitor-dashboard/leads/${leadId}`);
    await expect(page.getByRole("heading", { name: `E2E Lead ${suffix}` })).toBeVisible();

    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: "contacted", exact: true }).click();
    await expect(page.getByText("Status updated")).toBeVisible();

    await page.getByLabel("Priority").click();
    await page.getByRole("option", { name: "high", exact: true }).click();
    await expect(page.getByText("Priority updated")).toBeVisible();

    await page.getByLabel("Follow-up Date").fill("2026-11-12");
    await page.getByLabel("Notes").fill("Requested a detailed product catalogue; follow up next week.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    const persistedResponse = await page.request.get(`/api/leads/${leadId}`, { headers: auth });
    expect(persistedResponse.status(), await persistedResponse.text()).toBe(200);
    const persisted = (await persistedResponse.json()).lead;
    expect(persisted.status).toBe("contacted");
    expect(persisted.priority).toBe("high");
    expect(persisted.notes).toBe("Requested a detailed product catalogue; follow up next week.");
    expect(new Date(persisted.followUpDate).toISOString().slice(0, 10)).toBe("2026-11-12");

    const otherToken = await login(page, OTHER_BUSINESS_EMAIL);
    const crossBusinessUpdate = await page.request.patch(`/api/leads/${leadId}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
      data: { status: "converted" },
    });
    expect(crossBusinessUpdate.status()).toBe(404);

    const afterDeniedUpdate = await page.request.get(`/api/leads/${leadId}`, { headers: auth });
    expect(afterDeniedUpdate.status()).toBe(200);
    expect((await afterDeniedUpdate.json()).lead.status).toBe("contacted");
  });
});
