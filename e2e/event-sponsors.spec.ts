import { test, expect, type Page } from "@playwright/test";

const EVENT_ID = "e2e-lead-event-001";
const EMAIL = "org1.owner@eventpass.test";
const PASSWORD = "DevPassword123!";

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.token).toBeTruthy();
  return payload.token as string;
}

test.describe("Sponsor specialization", () => {
  test("creates a sponsor package, assigns sponsor branding and exposes safe public data", async ({ page }) => {
    const token = await login(page);
    const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

    const packageResponse = await page.request.post("/api/events/" + EVENT_ID + "/sponsor-packages", {
      headers,
      data: {
        name: "E2E Gold " + Date.now(),
        amount: 125000,
        benefits: ["Main stage logo"],
        deliverables: ["Social post"],
      },
    });
    expect(packageResponse.status()).toBe(201);
    const sponsorPackage = (await packageResponse.json()).package;

    const sponsorResponse = await page.request.post("/api/events/" + EVENT_ID + "/sponsors", {
      headers,
      data: { name: "E2E Specialized Sponsor", organization: "E2E Sponsor Co", isPublic: true },
    });
    expect(sponsorResponse.status()).toBe(201);
    const sponsorId = (await sponsorResponse.json()).sponsor.id as string;

    const profileResponse = await page.request.put("/api/events/" + EVENT_ID + "/sponsors/" + sponsorId + "/profile", {
      headers,
      data: {
        packageId: sponsorPackage.id,
        logoUrl: "https://example.com/e2e-sponsor.png",
        brandPrimaryColor: "#123456",
        brandSecondaryColor: "#654321",
        amountOverride: 100000,
      },
    });
    expect(profileResponse.status()).toBe(200);
    expect((await profileResponse.json()).profile.package.name).toBe(sponsorPackage.name);

    const publicResponse = await page.request.get("/api/public/events/" + EVENT_ID + "/sponsors");
    expect(publicResponse.ok()).toBeTruthy();
    const publicBody = await publicResponse.json();
    const publicSponsor = publicBody.sponsors.find((item: { name: string }) => item.name === "E2E Specialized Sponsor");
    expect(publicSponsor).toBeTruthy();
    expect(publicSponsor.sponsorProfile.logoUrl).toBe("https://example.com/e2e-sponsor.png");
    expect(publicSponsor.sponsorProfile.amountOverride).toBeUndefined();
  });
});
