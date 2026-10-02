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

// Logging in is rate limited (20 per 15 minutes per IP) and the whole browser E2E job
// shares that budget, so this file logs in once and every test reuses the token.
let authToken = "";

async function login(page: Page): Promise<string> {
  await page.addInitScript((value) => localStorage.setItem("eventpass_token", value), authToken);
  return authToken;
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

test.beforeAll(async ({ playwright }, testInfo) => {
  const context = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const response = await context.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    expect(response.ok()).toBeTruthy();
    authToken = (await response.json()).token;
    expect(authToken).toBeTruthy();
  } finally {
    await context.dispose();
  }
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
  test("Place all and Place step around aisles and labels instead of landing on them", async ({ page }) => {
    test.setTimeout(90_000);
    const token = await login(page);
    const plan = await createDraft(page, token);
    // A full-width aisle across the top and a label right below it: exactly where new stalls would go by default.
    await api(page, token, "POST", `${BASE}/floor-plan-layouts/${plan.id}/elements/bulk`, {
      expectedVersion: plan.version,
      elements: [
        { type: "aisle", x: 0, y: 0, width: 1600, height: 120 },
        { type: "label", label: "Hall A", x: 20, y: 140, width: 300, height: 40 },
      ],
    });

    await page.goto(`/organizer/exhibitions/${EXHIBITION_ID}/floor-plan`);
    const stallButtons = page.locator('[role="button"][aria-label^="Stall "]');
    const placeAll = page.getByRole("button", { name: /^Place all \(\d+\)$/ });
    await expect(placeAll).toBeVisible();
    const total = Number(/\((\d+)\)/.exec(await placeAll.innerText())![1]);
    expect(total).toBeGreaterThan(1);

    /** Every stall box and element box on the canvas, in canvas units. */
    const overlaps = () =>
      page.evaluate(() => {
        const box = (el: Element) => {
          const e = el as HTMLElement;
          return { x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: parseFloat(e.style.height) };
        };
        const stalls = Array.from(document.querySelectorAll('[role="button"][aria-label^="Stall "]')).map(box);
        const features = Array.from(document.querySelectorAll('[aria-label^="Plan feature"]')).map(box);
        const hit = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        return {
          onFeature: stalls.filter((s) => features.some((f) => hit(s, f))).length,
          onStall: stalls.filter((s, i) => stalls.some((o, j) => i !== j && hit(s, o))).length,
          outside: stalls.filter((s) => s.x < 0 || s.y < 0 || s.x + s.w > 1600 || s.y + s.h > 1000).length,
          count: stalls.length,
        };
      });

    await placeAll.click();
    await expect(stallButtons).toHaveCount(total);
    expect(await overlaps()).toEqual({ onFeature: 0, onStall: 0, outside: 0, count: total });

    // Take one off and put it back with the single Place button: it must also find a free spot.
    await stallButtons.first().focus();
    await page.keyboard.press("Delete");
    await expect(stallButtons).toHaveCount(total - 1);
    await page.getByRole("button", { name: "Place", exact: true }).first().click();
    await expect(stallButtons).toHaveCount(total);
    expect(await overlaps()).toEqual({ onFeature: 0, onStall: 0, outside: 0, count: total });
  });
  test("plan elements can be selected together, moved, aligned and removed as one step", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1500, height: 1200 });
    const token = await login(page);
    const plan = await createDraft(page, token);
    const planUrl = `${BASE}/floor-plan-layouts/${plan.id}`;
    // Four pillars scattered over an empty area (no stalls there), so a selection box picks elements.
    await api(page, token, "POST", `${planUrl}/elements/bulk`, {
      expectedVersion: plan.version,
      elements: [
        { type: "pillar", x: 100, y: 500, width: 36, height: 36 },
        { type: "pillar", x: 330, y: 560, width: 36, height: 36 },
        { type: "pillar", x: 600, y: 470, width: 36, height: 36 },
        { type: "pillar", x: 900, y: 590, width: 36, height: 36 },
      ],
    });
    const serverState = async () => {
      const detail = await api<{ floorPlan: { version: number }; elements: Array<{ id: string; x: string; y: string }> }>(page, token, "GET", planUrl);
      return { version: detail.floorPlan.version, elements: detail.elements.map((e) => ({ id: e.id, x: Number(e.x), y: Number(e.y) })).sort((a, b) => a.id.localeCompare(b.id)) };
    };

    await page.goto(`/organizer/exhibitions/${EXHIBITION_ID}/floor-plan`);
    const pillars = page.getByRole("button", { name: "Plan feature: pillar" });
    await expect(pillars).toHaveCount(4);
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const canvas = page.locator("div.relative.bg-card.border").first();
    /** Canvas units to screen pixels, measured fresh (the canvas rescales when the layout changes). */
    const screen = async (x: number, y: number) => {
      const box = (await canvas.boundingBox())!;
      return { x: box.x + (x * box.width) / 1600, y: box.y + (y * box.width) / 1600 };
    };
    const xs = () => pillars.evaluateAll((els) => els.map((el) => parseFloat((el as HTMLElement).style.left)));

    // A selection box over the pillars selects exactly them, and only elements.
    const from = await screen(60, 440);
    const to = await screen(1000, 650);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText("4 plan elements selected")).toBeVisible();

    // Dragging one moves all four: one request, one version bump.
    const before = await serverState();
    const grab = (await pillars.first().boundingBox())!;
    const target = await screen(0, 0);
    const shifted = await screen(120, 80);
    await page.mouse.move(grab.x + 4, grab.y + 4);
    await page.mouse.down();
    await page.mouse.move(grab.x + 4 + (shifted.x - target.x), grab.y + 4 + (shifted.y - target.y), { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await serverState()).version).toBe(before.version + 1);
    const moved = await serverState();
    for (const element of moved.elements) {
      const original = before.elements.find((e) => e.id === element.id)!;
      expect(Math.abs(element.x - original.x - 120)).toBeLessThan(3);
      expect(Math.abs(element.y - original.y - 80)).toBeLessThan(3);
    }

    // One undo puts all four back (and clears the selection).
    await expect(undo).toHaveAttribute("title", /Move 4 plan elements/);
    await undo.click();
    await expect.poll(async () => JSON.stringify((await serverState()).elements)).toBe(JSON.stringify(before.elements));
    await expect(page.getByText("4 plan elements selected")).toHaveCount(0);

    // Re-select, then align left: every selected element ends up at one x.
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText("4 plan elements selected")).toBeVisible();
    await page.getByRole("button", { name: "Align left" }).click();
    await expect.poll(async () => new Set(await xs()).size).toBe(1);

    // Remove all four in one step; one undo brings back the same elements under the same ids.
    await page.getByRole("button", { name: "Remove 4 from plan" }).click();
    await expect(pillars).toHaveCount(0);
    expect((await serverState()).elements).toHaveLength(0);
    await undo.click();
    await expect(pillars).toHaveCount(4);
    expect((await serverState()).elements.map((e) => e.id)).toEqual(before.elements.map((e) => e.id));
  });
  test("Undo pressed while an edit is still being saved undoes that edit, not an earlier one", async ({ page }) => {
    test.setTimeout(90_000);
    const token = await login(page);
    await createDraft(page, token);

    await page.goto(`/organizer/exhibitions/${EXHIBITION_ID}/floor-plan`);
    const stallButtons = page.locator('[role="button"][aria-label^="Stall "]');
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    const placeAll = page.getByRole("button", { name: /^Place all \(\d+\)$/ });
    await expect(placeAll).toBeVisible();
    const total = Number(/\((\d+)\)/.exec(await placeAll.innerText())![1]);
    await placeAll.click();
    await expect(stallButtons).toHaveCount(total);
    await expect(undo).toHaveAttribute("title", /Place \d+ stalls/);

    const lefts = () => stallButtons.evaluateAll((els) => els.map((el) => (el as HTMLElement).style.left));
    await page.getByRole("button", { name: "Select all" }).click();
    await expect(page.getByText(`${total} stalls selected`)).toBeVisible();

    // Make the save slow, so Undo is pressed while "Align left" is still on its way to the server.
    // An edit only enters the undo history once saved; Undo used to pick the previous entry here.
    await page.route("**/objects/bulk-update", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.getByRole("button", { name: "Align left" }).click();
    await expect.poll(async () => new Set(await lefts()).size).toBe(1); // the screen already shows it aligned
    await undo.click(); // ...but the save has not finished

    // The align is what gets undone: the stalls spread out again and none of them disappear.
    await expect.poll(async () => new Set(await lefts()).size, { timeout: 15_000 }).toBeGreaterThan(1);
    await expect(stallButtons).toHaveCount(total);
    // The earlier "Place all" is still the next thing to undo, and the align can be redone.
    await expect(undo).toHaveAttribute("title", /Place \d+ stalls/);
    await expect(redo).toHaveAttribute("title", /Align left/);
  });
});
