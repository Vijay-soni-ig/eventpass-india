import { test, expect, type Page } from "@playwright/test";

const EXHIBITION_ID = "seed-exhibition-1";
const EVENT_ID = "e2e-lead-event-001";
const EMAIL = "org1.owner@eventpass.test";
const PASSWORD = "DevPassword123!";

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem("eventpass_token", token), payload.token);
  return payload.token as string;
}

async function jsonRequest(page: Page, token: string, path: string, init: { method?: string; body?: string } = {}) {
  const headers: Record<string, string> = { Authorization: "Bearer " + token };
  if (init.body) headers["Content-Type"] = "application/json";
  return page.request.fetch(path, { method: init.method, headers, data: init.body });
}

test.describe("Universal Event participant API and workspace", () => {
  test("verifies module-gated CRUD for every participant type", async ({ page }) => {
    const token = await login(page);
    const exhibitionResponse = await jsonRequest(page, token, "/api/exhibitions/" + EXHIBITION_ID);
    expect(exhibitionResponse.ok()).toBeTruthy();
    const exhibitionPayload = await exhibitionResponse.json();
    expect(exhibitionPayload.exhibition.eventId).toBe(EVENT_ID);

    const modules = [
      ["PARTICIPANTS", "participants", "PARTICIPANT", "Browser E2E Participant"],
      ["SPEAKERS", "speakers", "SPEAKER", "Browser E2E Speaker"],
      ["SPONSORS", "sponsors", "SPONSOR", "Browser E2E Sponsor"],
      ["VENDORS", "vendors", "VENDOR", "Browser E2E Vendor"],
      ["PARTICIPANTS", "partners", "PARTNER", "Browser E2E Partner"],
      ["PARTICIPANTS", "staff", "STAFF", "Browser E2E Staff"],
    ] as const;

    const created: Array<{ endpoint: string; id: string }> = [];
    for (const [moduleType, endpoint, participantType, name] of modules) {
      const enable = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/modules/" + moduleType, {
        method: "PUT",
        body: JSON.stringify({ enabled: true }),
      });
      expect(enable.status(), "enable " + moduleType + " body=" + (await enable.text())).toBe(200);

      const create = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/" + endpoint, {
        method: "POST",
        body: JSON.stringify({ name, organization: "E2E Organization", title: "E2E Role", isPublic: true }),
      });
      expect(create.status(), "create " + endpoint).toBe(201);
      const body = await create.json();
      const responseKey: Record<string, string> = { participants: "participant", speakers: "speaker", sponsors: "sponsor", vendors: "vendor", partners: "partner", staff: "staff" };
      const record = body[responseKey[endpoint]];
      expect(record?.id, "created id for " + endpoint).toBeTruthy();
      created.push({ endpoint, id: record.id });

      const list = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/" + endpoint + "?search=" + encodeURIComponent(name) + "&sortBy=name&sortDir=asc&page=1&limit=10");
      expect(list.status(), "list " + endpoint).toBe(200);
      const listBody = await list.json();
      expect(listBody.total).toBeGreaterThanOrEqual(1);
      expect(listBody[endpoint]?.some((item: { name: string }) => item.name === name)).toBeTruthy();

      const update = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/" + endpoint + "/" + record.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "INACTIVE", title: "Updated E2E Role" }),
      });
      expect(update.status(), "update " + endpoint).toBe(200);

      const inactive = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/" + endpoint + "?status=INACTIVE&search=" + encodeURIComponent(name));
      expect(inactive.status()).toBe(200);
      expect((await inactive.json()).total).toBeGreaterThanOrEqual(1);

      const archive = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/" + endpoint + "/" + record.id, { method: "DELETE" });
      expect(archive.status(), "archive " + endpoint).toBe(204);

      const restore = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/" + endpoint + "/" + record.id + "/restore", { method: "POST" });
      expect(restore.status(), "restore " + endpoint).toBe(200);
    }

    const disable = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/modules/SPEAKERS", {
      method: "PUT",
      body: JSON.stringify({ enabled: false }),
    });
    expect(disable.status()).toBe(200);

    const gated = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/speakers");
    expect(gated.status()).toBe(409);

    const invalidSort = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/participants?sortBy=notAllowed");
    expect(invalidSort.status()).toBe(400);
  });

  test("loads organizer workspace, module controls, search, status and pagination", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push("PAGEERROR: " + error.message));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push("CONSOLE: " + message.text()); });

    const token = await login(page);
    const exhibitionResponse = await jsonRequest(page, token, "/api/exhibitions/" + EXHIBITION_ID);
    expect(exhibitionResponse.ok()).toBeTruthy();
    expect((await exhibitionResponse.json()).exhibition.eventId).toBe(EVENT_ID);

    for (const moduleType of ["PARTICIPANTS", "SPEAKERS", "SPONSORS", "VENDORS"]) {
      const enable = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/modules/" + moduleType, {
        method: "PUT",
        body: JSON.stringify({ enabled: true }),
      });
      expect(enable.status()).toBe(200);
    }

    await page.goto("/organizer/exhibitions/" + EXHIBITION_ID + "/participants");
    await page.waitForLoadState("networkidle");
    const heading = page.getByRole("heading", { name: "Event Participants" });
    if (!(await heading.isVisible().catch(() => false))) {
      throw new Error("Participant workspace did not render. URL=" + page.url() + "\nBROWSER_ERRORS=" + browserErrors.join(" | ") + "\nBODY=" + (await page.locator("body").innerText()).slice(0, 3000));
    }

    await expect(page.getByText("Participant modules")).toBeVisible();
    await expect(page.getByRole("button", { name: /Participants: Enabled/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Speakers: Enabled/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Sponsors: Enabled/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Vendors: Enabled/ })).toBeVisible();

    for (const tab of ["All Participants", "Speakers", "Sponsors", "Vendors", "Partners", "Staff"]) {
      await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
    }

    await page.getByRole("button", { name: "Speakers", exact: true }).click();
    await expect(page.getByText("E2E Speaker", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sponsors", exact: true }).click();
    await expect(page.getByText("E2E Sponsor", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Vendors", exact: true }).click();
    const vendorName = "Browser UI Vendor " + Date.now();
    await page.getByRole("button", { name: /Add Vendor/ }).click();
    await page.getByLabel("Name").fill(vendorName);
    await page.getByLabel("Organization").fill("E2E Vendor Organization");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("Vendors added", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Search Vendors" }).fill(vendorName);
    await expect(page.getByRole("heading", { name: vendorName, exact: true })).toBeVisible();

    await page.getByLabel("Participant status").selectOption("INACTIVE");
    await expect(page.getByRole("heading", { name: vendorName, exact: true })).toBeVisible();

    await page.getByLabel("Participant status").selectOption("ACTIVE");
    await page.getByRole("button", { name: "Edit" }).last().click();
    await page.getByLabel("Participant record status").selectOption("INACTIVE");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Vendors updated", { exact: true })).toBeVisible();

    await page.getByLabel("Participant status").selectOption("ARCHIVED");
    await expect(page.getByRole("heading", { name: vendorName, exact: true })).not.toBeVisible();
    await expect(page.getByText("No Vendors found")).toBeVisible();

    await page.getByLabel("Participant status").selectOption("ACTIVE");
    await page.getByRole("button", { name: "Participants", exact: true }).click();
    const participantName = "Browser UI Participant " + Date.now();
    await page.getByRole("button", { name: /Add Participant/ }).click();
    await page.getByLabel("Name").fill(participantName);
    await page.getByLabel("Organization").fill("E2E Organization");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("Participants added", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Search All Participants" }).fill(participantName);
    await expect(page.getByRole("heading", { name: participantName, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).last().click();
    await page.getByLabel("Participant record status").selectOption("INACTIVE");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Participants updated", { exact: true })).toBeVisible();

    await page.getByLabel("Participant status").selectOption("ARCHIVED");
    await expect(page.getByText("No All Participants found")).toBeVisible();
    await page.getByLabel("Participant status").selectOption("ACTIVE");

    const archivedSearch = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/participants?status=ARCHIVED&search=" + encodeURIComponent(participantName));
    expect(archivedSearch.status()).toBe(200);
    expect((await archivedSearch.json()).total).toBeGreaterThanOrEqual(1);
  });
});
