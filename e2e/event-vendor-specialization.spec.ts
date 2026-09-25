import { test, expect } from "@playwright/test";

test("vendor specialization API flow", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("e2e-organizer@example.com");
  await page.getByLabel(/password/i).fill("TestPassword123!");
  await page.getByRole("button", { name: /sign in|login/i }).click();
  await expect(page).not.toHaveURL(/login/);

  const token = await page.evaluate(() => localStorage.getItem("token") || localStorage.getItem("authToken"));
  expect(token).toBeTruthy();

  const events = await request.get("/api/events", { headers: { Authorization: "Bearer " + token } });
  expect(events.ok()).toBeTruthy();
  const eventBody = await events.json();
  const event = eventBody.events?.[0] ?? eventBody.data?.[0];
  expect(event?.id).toBeTruthy();

  const enable = await request.put("/api/events/" + event.id + "/modules/VENDORS", { headers: { "Content-Type":"application/json", Authorization:"Bearer "+token }, data:{enabled:true} });
  expect([200,409]).toContain(enable.status());

  const service = await request.post("/api/events/" + event.id + "/vendor-services", { headers: { "Content-Type":"application/json", Authorization:"Bearer "+token }, data:{name:"E2E Catering",category:"Food"} });
  expect(service.status()).toBe(201);
  const serviceId=(await service.json()).service.id;

  const vendor=await request.post("/api/events/"+event.id+"/vendors",{headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},data:{name:"E2E Vendor",isPublic:true}});
  expect(vendor.status()).toBe(201);
  const vendorId=(await vendor.json()).vendor.id;

  const profile=await request.put("/api/events/"+event.id+"/vendors/"+vendorId+"/profile",{headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},data:{contactName:"Private Contact",contactEmail:"private@example.com",serviceIds:[serviceId]}});
  expect(profile.status()).toBe(200);
});
