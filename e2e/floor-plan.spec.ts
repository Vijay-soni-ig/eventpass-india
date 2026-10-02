import { createRequire } from "node:module";
import { test, expect, type Page } from "@playwright/test";

const { resetE2eFloorPlans } = createRequire(import.meta.url)("./reset-floor-plans.cjs") as {
  resetE2eFloorPlans: (exhibitionId: string) => Promise<number>;
};

const EXHIBITION_ID = "seed-exhibition-1";
const EMAIL = "org1.owner@eventpass.test";
const PASSWORD = "DevPassword123!";
const BASE = `/api/exhibitions/${EXHIBITION_ID}`;

interface StallRow {
  id: string;
  code: string | null;
  status: "available" | "reserved" | "sold";
}

async function login(page: Page): Promise<string> {
  const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json();
  expect(token).toBeTruthy();
  await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), token);
  return token as string;
}

async function api<T = Record<string, unknown>>(page: Page, token: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await page.request.fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    data: body ? JSON.stringify(body) : undefined,
  });
  expect(response.ok(), `${method} ${path} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

async function loadStalls(page: Page, token: string): Promise<StallRow[]> {
  const { exhibition } = await api<{ exhibition: { stalls: StallRow[] } }>(page, token, "GET", BASE);
  return exhibition.stalls;
}

async function createDraft(page: Page, token: string) {
  const { floorPlan } = await api<{ floorPlan: { id: string; version: number } }>(page, token, "POST", `${BASE}/floor-plan-layouts`, {
    name: `E2E ${Date.now()}`,
    canvasWidth: 1600,
    canvasHeight: 1000,
  });
  return floorPlan;
}

/** Builds and publishes a plan through the API: every stall in a grid, plus an entrance and a text label. */
async function publishedPlan(page: Page, token: string, stalls: StallRow[]) {
  const plan = await createDraft(page, token);
  const url = `${BASE}/floor-plan-layouts/${plan.id}`;
  await api(page, token, "POST", `${url}/objects/bulk`, {
    expectedVersion: plan.version,
    objects: stalls.map((s, i) => ({ stallId: s.id, x: 60 + (i % 4) * 170, y: 60 + Math.floor(i / 4) * 130, width: 130, height: 90 })),
  });
  await api(page, token, "POST", `${url}/elements/bulk`, {
    expectedVersion: plan.version + 1,
    elements: [
      { type: "entrance", label: "Main gate", x: 60, y: 800, width: 160, height: 50 },
      { type: "label", label: "Hall A", x: 800, y: 60, width: 220, height: 40 },
    ],
  });
  await api(page, token, "POST", `${url}/publish`, { expectedVersion: plan.version + 2 });
}

test.beforeAll(async () => {
  await resetE2eFloorPlans(EXHIBITION_ID);
});

test.describe("Floor plan", () => {
  test("organizer places stalls, adds plan elements, uses undo/redo and publishes", async ({ page }) => {
    test.setTimeout(120_000);
    const token = await login(page);
    const stalls = await loadStalls(page, token);
    const total = stalls.length;
    expect(total).toBeGreaterThan(2);
    await createDraft(page, token);

    await page.goto(`/organizer/exhibitions/${EXHIBITION_ID}/floor-plan`);
    const stallButtons = page.locator('[role="button"][aria-label^="Stall "]');
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });

    // Guided flow: no history yet, then place every stall in one step.
    await expect(undo).toBeDisabled();
    await page.getByRole("button", { name: `Place all (${total})` }).click();
    await expect(stallButtons).toHaveCount(total);
    await expect(page.getByText(`${total} of ${total} placed`)).toBeVisible();

    // Undo and redo a bulk placement.
    await undo.click();
    await expect(stallButtons).toHaveCount(0);
    await redo.click();
    await expect(stallButtons).toHaveCount(total);

    // Plan elements: add, edit, undo, redo.
    await page.getByRole("button", { name: "Add aisle", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Aisle" })).toBeVisible();
    const aisle = page.getByRole("button", { name: "Plan feature: aisle" });
    await expect(aisle).toBeVisible();
    await undo.click();
    await expect(aisle).toHaveCount(0);
    await redo.click();
    await expect(aisle).toBeVisible();

    await page.getByRole("button", { name: "Add text label", exact: true }).click();
    const text = page.locator("#element-text");
    await expect(text).toHaveValue("Label");
    await text.fill("Hall A");
    await text.blur();
    await expect(page.getByText("Hall A", { exact: true })).toBeVisible();

    // A label can't be left empty.
    await text.fill("");
    await text.blur();
    await expect(page.getByText("A text label needs some text").first()).toBeVisible();
    await expect(text).toHaveValue("Hall A");

    // Multi-select, align, undo.
    const lefts = () => stallButtons.evaluateAll((els) => els.map((el) => (el as HTMLElement).style.left));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Select all" }).click();
    await expect(page.getByText(`${total} stalls selected`)).toBeVisible();
    await page.getByRole("button", { name: "Align left" }).click();
    await expect.poll(async () => new Set(await lefts()).size).toBe(1);
    await undo.click();
    await expect.poll(async () => new Set(await lefts()).size).toBeGreaterThan(1);
    await page.keyboard.press("Escape");

    // Everything survives a reload.
    await page.reload();
    await expect(stallButtons).toHaveCount(total);
    await expect(page.getByText("Hall A", { exact: true })).toBeVisible();
    await expect(aisle).toBeVisible();
    await expect(undo).toBeDisabled();

    // Publish locks the plan.
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Floor plan published").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Add aisle" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit plan" })).toBeVisible();

    // Editing a published plan copies it, elements included, into a new draft.
    await page.getByRole("button", { name: "Edit plan" }).click();
    await expect(page.getByText(/Draft created/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await expect(stallButtons).toHaveCount(total);
    await expect(page.getByRole("button", { name: "Plan feature: aisle" })).toBeVisible();
    await expect(undo).toBeDisabled();
  });

  test("visitors see the published plan with elements, price view, filters and stall details", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const token = await login(page);
    const stalls = await loadStalls(page, token);
    const total = stalls.length;
    const booked = stalls.filter((s) => s.status !== "available").length;
    const available = stalls.filter((s) => s.status === "available");
    expect(available.length).toBeGreaterThan(0);
    await publishedPlan(page, token, stalls);

    const visitor = await browser.newPage();
    try {
      await visitor.goto(`/exhibition/${EXHIBITION_ID}`);
      const summary = visitor.getByTestId("floor-plan-summary");
      await expect(summary).toBeVisible();
      await expect(summary).toHaveText(`${total} stalls · ${Math.round((booked / total) * 100)}% booked`);

      // Plan elements are drawn, and are not interactive.
      await expect(visitor.getByText("Main gate", { exact: true })).toBeVisible();
      await expect(visitor.getByText("Hall A", { exact: true })).toBeVisible();
      await expect(visitor.locator('[aria-hidden="true"]').getByText("Hall A", { exact: true })).toHaveCount(1);

      // Price view and filters.
      await visitor.getByRole("button", { name: "Price", exact: true }).click();
      await expect(visitor.getByLabel("Price scale")).toBeVisible();
      await visitor.getByRole("switch", { name: "Available only" }).click();
      await expect(summary).toContainText(`${available.length} of ${total} stalls shown`);
      await visitor.getByRole("button", { name: "Clear filters" }).click();
      await expect(summary).toHaveText(`${total} stalls · ${Math.round((booked / total) * 100)}% booked`);

      // Zoom controls work and the plan stays inside the page.
      // (the venue map above has its own Leaflet "Zoom in", so scope to the plan's toolbar)
      const toolbar = visitor.locator("div.flex.items-center.justify-end").filter({ has: visitor.locator("span.tabular-nums") }).first();
      const zoomLevel = toolbar.locator("span.tabular-nums");
      const before = parseInt((await zoomLevel.innerText()).replace("%", ""), 10);
      await toolbar.getByRole("button", { name: "Zoom in" }).click();
      await expect.poll(async () => parseInt((await zoomLevel.innerText()).replace("%", ""), 10)).toBeGreaterThan(before);
      expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();

      // Tapping an available stall shows its details; the stall still sits on top of the elements.
      await visitor.getByRole("button", { name: new RegExp(`^Stall ${available[0].code}`) }).click();
      await expect(visitor.getByText("per event")).toBeVisible();
    } finally {
      await visitor.close();
    }
  });

  test("an exhibition can be split into halls: each hall has its own plan and visitors get a tab per hall", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const token = await login(page);
    const stalls = await loadStalls(page, token);
    await publishedPlan(page, token, stalls); // the first hall ("Main Hall") with every seeded stall

    // A second hall with two brand-new stalls, created and placed in one step.
    const { hall } = await api<{ hall: { id: string } }>(page, token, "POST", `${BASE}/halls`, { name: "E2E Hall B" });
    const { floorPlan } = await api<{ floorPlan: { id: string; version: number } }>(page, token, "POST", `${BASE}/floor-plan-layouts`, {
      hallId: hall.id,
      name: "E2E Hall B plan",
      canvasWidth: 1000,
      canvasHeight: 600,
    });
    await api(page, token, "POST", `${BASE}/floor-plan-layouts/${floorPlan.id}/generate-stalls`, {
      expectedVersion: floorPlan.version,
      prefix: "E2E-",
      startNumber: 1,
      padding: 2,
      count: 2,
      stallType: "standard",
      price: 6500,
      x: 40,
      y: 40,
      width: 120,
      height: 80,
      columns: 2,
      gap: 20,
    });

    // A stall is in one hall at a time: a seeded stall (already in Main Hall) can't also go in
    // Hall B. Checked while Hall B's plan is still a draft, so it is the hall rule that refuses.
    const refused = await page.request.fetch(`${BASE}/floor-plan-layouts/${floorPlan.id}/objects`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: JSON.stringify({ expectedVersion: floorPlan.version + 1, stallId: stalls[0].id, x: 400, y: 400, width: 80, height: 60 }),
    });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe("STALL_IN_OTHER_HALL");

    await api(page, token, "POST", `${BASE}/floor-plan-layouts/${floorPlan.id}/publish`, { expectedVersion: floorPlan.version + 1 });

    // Organizer: a tab per hall, and each hall counts only the stalls it can use.
    await page.goto(`/organizer/exhibitions/${EXHIBITION_ID}/floor-plan`);
    await expect(page.getByRole("tab", { name: /^Main Hall/ })).toBeVisible();
    await page.getByRole("tab", { name: /^E2E Hall B/ }).click();
    await expect(page.getByText(`2 of 2 placed (${stalls.length} in other halls)`)).toBeVisible();
    await expect(page.locator('[role="button"][aria-label^="Stall E2E-"]')).toHaveCount(2);
    await page.getByRole("tab", { name: /^Main Hall/ }).click();
    await expect(page.getByText(`${stalls.length} of ${stalls.length} placed (2 in other halls)`)).toBeVisible();

    // Visitors: tabs appear because there is more than one hall.
    const visitor = await browser.newPage();
    try {
      await visitor.goto(`/exhibition/${EXHIBITION_ID}`);
      const mainTab = visitor.getByRole("tab", { name: /^Main Hall/ });
      const hallBTab = visitor.getByRole("tab", { name: /^E2E Hall B/ });
      await expect(mainTab).toBeVisible();
      await expect(hallBTab).toContainText("2 available");
      await expect(visitor.getByTestId("floor-plan-summary")).toContainText(`${stalls.length} stalls`);
      await hallBTab.click();
      await expect(visitor.locator('button[aria-label^="Stall E2E-"]')).toHaveCount(2);
      await expect(visitor.getByTestId("floor-plan-summary")).toHaveText("2 stalls · 0% booked");
    } finally {
      await visitor.close();
    }
  });
});
