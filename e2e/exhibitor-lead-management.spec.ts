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

    const comboboxes = page.getByRole("combobox");
    await comboboxes.nth(0).click();
    await page.getByRole("option", { name: "contacted", exact: true }).click();
    await expect(page.getByText("Status updated")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Hold the priority mutation's detail refetch until after the user has
    // edited the form. This deterministically exercises the background-refetch
    // race that previously reset the follow-up date and notes to stale values.
    let releaseDetailRefetch: () => void = () => {};
    let signalDetailRefetch: () => void = () => {};
    const detailRefetchStarted = new Promise<void>((resolve) => {
      signalDetailRefetch = resolve;
    });
    const allowDetailRefetch = new Promise<void>((resolve) => {
      releaseDetailRefetch = resolve;
    });
    let heldDetailRefetch = false;
    await page.route(`**/api/leads/${leadId}`, async (route) => {
      if (route.request().method() !== "GET" || heldDetailRefetch) {
        await route.continue();
        return;
      }
      heldDetailRefetch = true;
      const response = await route.fetch();
      signalDetailRefetch();
      await allowDetailRefetch;
      await route.fulfill({ response });
    });

    const followUpInput = page.locator('input[type="date"]');
    const notesInput = page.locator("textarea");
    try {
      await page.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "high", exact: true }).click();
      await expect(page.getByText("Priority updated")).toBeVisible();
      await detailRefetchStarted;

      await followUpInput.fill("2026-11-12");
      await notesInput.fill("Requested a detailed product catalogue; follow up next week.");
    } finally {
      releaseDetailRefetch();
    }

    await expect(followUpInput).toHaveValue("2026-11-12");
    await expect(notesInput).toHaveValue("Requested a detailed product catalogue; follow up next week.");
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
  
  test("lead notes save failure is visible and preserves unsaved changes", async ({ page }) => {
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
        visitorName: `E2E Lead Save Failure ${suffix}`,
        visitorEmail: `e2e-lead-save-failure-${suffix}@example.com`,
        notes: "Original note",
        source: "manual",
        priority: "medium",
      },
    });
    expect(createdResponse.status(), await createdResponse.text()).toBe(201);
    const leadId = (await createdResponse.json()).lead.id as string;

    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), ownerToken);
    await page.route(`**/api/leads/${leadId}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Injected lead save failure" }),
      });
    });

    await page.goto(`/exhibitor-dashboard/leads/${leadId}`);
    await expect(page.getByRole("heading", { name: `E2E Lead Save Failure ${suffix}` })).toBeVisible();
    await page.locator("textarea").fill("Unsaved note that must be preserved");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText("Injected lead save failure")).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
    await expect(page.locator("textarea")).toHaveValue("Unsaved note that must be preserved");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  });


  test("lead list API failures are announced accessibly and recover through retry", async ({ page }) => {
    const token = await login(page, OWNER_EMAIL);
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
    let requests = 0;
    let allowRecovery = false;
    await page.route(/\/api\/leads(?:\?.*)?$/, async (route) => {
      requests += 1;
      if (!allowRecovery) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Injected lead list failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/exhibitor-dashboard/leads");
    await expect(page.getByText("Couldn't load leads.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).toContainText("Couldn't load leads.");
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    const failedRequests = requests;
    allowRecovery = true;
    await retry.click();
    await expect.poll(() => requests, { timeout: 5_000 }).toBe(failedRequests + 1);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
  });



  test("exhibitor exhibition list API failures are announced and recover through retry", async ({ page }) => {
    const token = await login(page, OWNER_EMAIL);
    await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
    let requests = 0;
    let allowRecovery = false;
    await page.route("**/api/exhibitor/participations**", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      requests += 1;
      if (!allowRecovery) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Injected exhibitor participations failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/exhibitor-dashboard/exhibitions");
    await expect(page.getByText("Could not load your exhibitions.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).toContainText("Could not load your exhibitions.");
    const failedRequests = requests;
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    allowRecovery = true;
    await retry.click();
    await expect.poll(() => requests, { timeout: 10_000 }).toBeGreaterThan(failedRequests);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Exhibitions", exact: true })).toBeVisible();
  });

  
  test("exhibitor follow-up work queue shows assigned tasks and completes them", async ({ page }) => {
    const ownerToken = await login(page, OWNER_EMAIL);
    const auth = { Authorization: `Bearer ${ownerToken}` };
    const participationsResponse = await page.request.get("/api/exhibitor/participations", { headers: auth });
    expect(participationsResponse.status(), await participationsResponse.text()).toBe(200);
    const participationsPayload = await participationsResponse.json();
    const participation = participationsPayload.participations.find(
      (item: { status: string; exhibition?: { eventId?: string } }) => item.status === "confirmed" && item.exhibition?.eventId,
    );
    expect(participation, "seeded exhibitor should have a confirmed Event-linked participation").toBeTruthy();

    const membershipsResponse = await page.request.get("/api/exhibitor-members", { headers: auth });
    expect(membershipsResponse.status(), await membershipsResponse.text()).toBe(200);
    const memberships = await membershipsResponse.json();
    const ownerMembership = memberships.memberships.find((item: { status: string; role: string; userId: string | null }) => item.status === "active" && item.role === "owner" && item.userId);
    expect(ownerMembership, "owner should have an active exhibitor membership").toBeTruthy();

    const suffix = Date.now();
    const leadResponse = await page.request.post("/api/event-leads", {
      headers: auth,
      data: {
        eventId: participation.exhibition.eventId,
        exhibitorBusinessId: participation.exhibitorBusinessId,
        exhibitionExhibitorId: participation.id,
        visitorName: `Follow-up Queue E2E ${suffix}`,
        visitorEmail: `follow-up-queue-${suffix}@example.com`,
        source: "MANUAL",
      },
    });
    expect(leadResponse.status(), await leadResponse.text()).toBe(201);
    const lead = (await leadResponse.json()).lead;

    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const followUpResponse = await page.request.post(`/api/event-leads/${lead.id}/follow-ups`, {
      headers: auth,
      data: { assignedToUserId: ownerMembership.userId, dueAt, note: "Send product catalogue" },
    });
    expect(followUpResponse.status(), await followUpResponse.text()).toBe(201);
    const followUp = (await followUpResponse.json()).followUp;

    await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), ownerToken);
    await page.goto("/exhibitor-dashboard/leads");
    await expect(page.getByRole("heading", { name: "Follow-up work queue" })).toBeVisible();
    await expect(page.getByRole("link", { name: `Follow-up Queue E2E ${suffix}`, exact: true }).last()).toBeVisible();
    const selects = page.getByRole("combobox");
    await selects.last().click();
    await page.getByRole("option", { name: "Assigned to me" }).click();
    await expect(page.getByText("Send product catalogue")).toBeVisible();
    await page.getByRole("button", { name: "Mark complete" }).click();
    await expect(page.getByText("Follow-up completed")).toBeVisible();
    const queueResponse = await page.request.get("/api/event-leads/follow-ups?due=ALL", { headers: auth });
    expect(queueResponse.status()).toBe(200);
    const queue = await queueResponse.json();
    expect(queue.followUps.some((item: { id: string }) => item.id === followUp.id)).toBe(false);
    const archiveResponse = await page.request.delete(`/api/event-leads/${lead.id}`, { headers: auth });
    expect(archiveResponse.status()).toBe(200);
  });

});
