import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "DevPassword123!";
const EXHIBITOR_EMAIL = "biz1.owner@eventpass.test";

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { email: EXHIBITOR_EMAIL, password: PASSWORD },
  });
  expect(response.status(), `login failed: ${await response.text()}`).toBe(200);
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  return payload.token as string;
}

test.describe("Exhibitor exhibition discovery", () => {
  test("lists only eligible exhibitions and opens the in-dashboard detail page", async ({ page }) => {
    const token = await login(page);
    const response = await page.request.get("/api/public/events?eventType=EXHIBITION&exhibitorEligible=true&limit=50");
    expect(response.status(), await response.text()).toBe(200);

    const payload = await response.json();
    expect(payload.events.length, "CI seed must contain at least one exhibitor-eligible exhibition").toBeGreaterThan(0);
    expect(payload.events.every((event: { eventType: string; exhibition: { id: string } | null }) =>
      event.eventType === "EXHIBITION" && Boolean(event.exhibition?.id)
    )).toBe(true);

    const exhibition = payload.events[0] as { id: string; title: string; exhibition: { id: string } };
    await page.addInitScript((authToken) => localStorage.setItem("eventpass_token", authToken), token);

    await page.goto("/exhibitor-dashboard/discover");
    await expect(page.getByRole("heading", { name: "Discover Exhibitions" })).toBeVisible();
    const exhibitionLink = page.getByRole("link", { name: exhibition.title, exact: true });
    await expect(exhibitionLink).toBeVisible();
    await exhibitionLink.click();

    await expect(page.getByRole("heading", { name: exhibition.title, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Discover" })).toBeVisible();
    await expect(page.getByRole("link", { name: "My Participations" })).toBeVisible();
  });
});
