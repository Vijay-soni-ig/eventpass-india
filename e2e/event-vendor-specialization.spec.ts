import { test, expect } from "@playwright/test";

const EVENT_ID = "e2e-public-event-001";
const EMAIL = "org1.owner@eventpass.test";
const PASSWORD = "DevPassword123!";

test("vendor specialization API flow", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(login.ok(), `login failed: ${await login.text()}`).toBeTruthy();
  const payload = await login.json();
  expect(payload.token).toBeTruthy();
  const headers = {
    Authorization: `Bearer ${payload.token}`,
    "Content-Type": "application/json",
  };

  const enable = await request.put(`/api/events/${EVENT_ID}/modules/VENDORS`, {
    headers,
    data: { enabled: true },
  });
  expect([200, 409]).toContain(enable.status());

  const service = await request.post(`/api/events/${EVENT_ID}/vendor-services`, {
    headers,
    data: { name: `E2E Catering ${Date.now()}`, category: "Food" },
  });
  expect(service.status(), await service.text()).toBe(201);
  const serviceId = (await service.json()).service.id;

  const vendor = await request.post(`/api/events/${EVENT_ID}/vendors`, {
    headers,
    data: { name: `E2E Vendor ${Date.now()}`, isPublic: true },
  });
  expect(vendor.status(), await vendor.text()).toBe(201);
  const vendorId = (await vendor.json()).vendor.id;

  const profile = await request.put(`/api/events/${EVENT_ID}/vendors/${vendorId}/profile`, {
    headers,
    data: {
      contactName: "Private Contact",
      contactEmail: "private@example.com",
      serviceIds: [serviceId],
    },
  });
  expect(profile.status(), await profile.text()).toBe(200);
});
