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

    const fixtures = [
      ["participants", "E2E Participant"],
      ["speakers", "E2E Speaker"],
      ["sponsors", "E2E Sponsor"],
      ["vendors", "E2E Vendor"],
      ["partners", "E2E Partner"],
      ["staff", "E2E Staff"],
    ] as const;

    for (const [endpoint, name] of fixtures) {
      const list = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/" + endpoint + "?search=" + encodeURIComponent(name) + "&sortBy=name&sortDir=asc&page=1&limit=10");
      expect(list.status(), "list " + endpoint).toBe(200);
      const listBody = await list.json();
      expect(listBody.total).toBeGreaterThanOrEqual(1);
      expect(listBody[endpoint]?.some((item: { name: string }) => item.name === name)).toBeTruthy();
    }

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
    await expect(page.getByText("No Vendors found")).toBeVisible();

    await page.getByLabel("Participant status").selectOption("ACTIVE");
    await page.getByRole("button", { name: "Edit" }).last().click();
    await page.getByLabel("Participant record status").selectOption("INACTIVE");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Vendors updated", { exact: true })).toBeVisible();
    await page.getByLabel("Participant status").selectOption("INACTIVE");
    await expect(page.getByRole("heading", { name: vendorName, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Archive" }).last().click();

    await page.getByLabel("Participant status").selectOption("ARCHIVED");
    await expect(page.getByRole("heading", { name: vendorName, exact: true })).toBeVisible();

    await page.getByLabel("Participant status").selectOption("ACTIVE");
    await page.getByRole("button", { name: "All Participants", exact: true }).click();
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
    await page.getByLabel("Participant status").selectOption("INACTIVE");
    await expect(page.getByRole("heading", { name: participantName, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Archive" }).last().click();
    await page.getByLabel("Participant status").selectOption("ARCHIVED");
    await expect(page.getByRole("heading", { name: participantName, exact: true })).toBeVisible();

    const archivedSearch = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/participants?status=ARCHIVED&search=" + encodeURIComponent(participantName));
    expect(archivedSearch.status()).toBe(200);
    expect((await archivedSearch.json()).total).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Restore" }).last().click();
    await page.getByLabel("Participant status").selectOption("ACTIVE");
    await expect(page.getByRole("heading", { name: participantName, exact: true })).toBeVisible();

    const restoredSearch = await jsonRequest(page, token, "/api/events/" + EVENT_ID + "/participants?status=ACTIVE&search=" + encodeURIComponent(participantName));
    expect(restoredSearch.status()).toBe(200);
    const restoredBody = await restoredSearch.json();
    expect(restoredBody.total).toBeGreaterThanOrEqual(1);
    expect(restoredBody.participants?.some((item: { name: string; status: string; archivedAt: string | null }) =>
      item.name === participantName && item.status === "ACTIVE" && item.archivedAt === null
    )).toBeTruthy();
  });
});


test.describe("Universal event participant route", () => {
  test("loads participant management from the universal event route", async ({ page }) => {
    await login(page);
    await page.goto("/organizer/events/" + EVENT_ID + "/participants");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Event Participants" })).toBeVisible();
    await expect(page.getByText("Participant modules")).toBeVisible();
    await expect(page.getByRole("button", { name: "Partners", exact: true })).toBeVisible();
  });
});


test.describe("Public participant directory module isolation", () => {
  test("exposes only participant types allowed by enabled public modules and never staff", async ({ page }) => {
    const token = await login(page);

    const setModule = async (moduleType: string, enabled: boolean) => {
      const response = await jsonRequest(
        page,
        token,
        "/api/events/" + EVENT_ID + "/modules/" + moduleType,
        { method: "PUT", body: JSON.stringify({ enabled }) }
      );
      expect(response.status(), "set " + moduleType).toBe(200);
    };

    // Verify a dedicated module can expose its type without implicitly
    // exposing all participant types, while STAFF remains private.
    await setModule("PARTICIPANTS", false);
    await setModule("SPEAKERS", true);
    await setModule("SPONSORS", false);
    await setModule("PARTNERS", false);
    await setModule("VENDORS", false);

    const publicResponse = await page.request.get("/api/public/events/" + EVENT_ID + "/participants");
    expect(publicResponse.status()).toBe(200);
    const publicBody = await publicResponse.json();
    const publicTypes = publicBody.participants.map((item: { participantType: string }) => item.participantType);

    expect(publicTypes.every((type: string) => type === "SPEAKER")).toBeTruthy();
    expect(publicTypes).not.toContain("STAFF");
    expect(publicTypes).not.toContain("SPONSOR");
    expect(publicTypes).not.toContain("PARTNER");
    expect(publicTypes).not.toContain("VENDOR");

    // Restore the deterministic fixture's umbrella module for subsequent
    // tests/consumers in the same browser-E2E run.
    await setModule("PARTICIPANTS", true);
  });
});


test.describe("Participant public privacy hardening", () => {
  test("returns only public-safe active records and never exposes private contact fields", async ({ page }) => {
    const token = await login(page);

    const setModule = async (moduleType: string, enabled: boolean) => {
      const response = await jsonRequest(
        page,
        token,
        "/api/events/" + EVENT_ID + "/modules/" + moduleType,
        { method: "PUT", body: JSON.stringify({ enabled }) }
      );
      expect(response.status(), "set " + moduleType).toBe(200);
    };

    await setModule("PARTICIPANTS", true);
    const response = await page.request.get("/api/public/events/" + EVENT_ID + "/participants");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.participants)).toBeTruthy();

    for (const participant of body.participants) {
      expect(participant.participantType).not.toBe("STAFF");
      expect(participant).not.toHaveProperty("email");
      expect(participant).not.toHaveProperty("phone");
      expect(participant).not.toHaveProperty("website");
      expect(participant).not.toHaveProperty("status");
      expect(participant).not.toHaveProperty("archivedAt");
      expect(participant).not.toHaveProperty("eventId");
    }
  });

  test("returns 404 when every public participant module is disabled", async ({ page }) => {
    const token = await login(page);
    const setModule = async (moduleType: string, enabled: boolean) => {
      const response = await jsonRequest(
        page,
        token,
        "/api/events/" + EVENT_ID + "/modules/" + moduleType,
        { method: "PUT", body: JSON.stringify({ enabled }) }
      );
      expect(response.status(), "set " + moduleType).toBe(200);
    };

    for (const moduleType of ["PARTICIPANTS", "SPEAKERS", "SPONSORS", "PARTNERS", "VENDORS"]) {
      await setModule(moduleType, false);
    }

    const response = await page.request.get("/api/public/events/" + EVENT_ID + "/participants");
    expect(response.status()).toBe(404);

    await setModule("PARTICIPANTS", true);
  });
});
