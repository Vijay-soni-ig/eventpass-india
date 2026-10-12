import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;
let previous: { maintenanceMode: boolean; maintenanceMessage: string | null } | null = null;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  previous = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { maintenanceMode: true, maintenanceMessage: true },
  });
});

after(async () => {
  if (previous) {
    await prisma.platformSettings.update({
      where: { id: "singleton" },
      data: previous,
    });
  } else {
    await prisma.platformSettings.deleteMany({ where: { id: "singleton" } });
  }
  await stop();
});

async function setMaintenance(enabled: boolean, message: string | null = null) {
  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", maintenanceMode: enabled, maintenanceMessage: message },
    update: { maintenanceMode: enabled, maintenanceMessage: message },
  });
}

test("maintenance mode blocks non-admin API traffic with a retryable 503 and configured message", async () => {
  await setMaintenance(true, "Scheduled maintenance. Please return shortly.");

  const response = await fetch(`${baseUrl}/api/public/events`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "300");
  assert.equal(body.code, "PLATFORM_MAINTENANCE");
  assert.equal(body.maintenanceMode, true);
  assert.equal(body.error, "Scheduled maintenance. Please return shortly.");
});

test("health and authentication endpoints remain reachable during maintenance", async () => {
  await setMaintenance(true, "Maintenance");

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "invalid", password: "x" }),
  });
  assert.notEqual(login.status, 503);
});

test("platform routes remain reachable through the maintenance gate and rely on their own RBAC", async () => {
  await setMaintenance(true, "Maintenance");

  const response = await fetch(`${baseUrl}/api/platform/settings`);
  assert.notEqual(response.status, 503);
});

test("disabling maintenance restores normal API routing", async () => {
  await setMaintenance(false);

  const response = await fetch(`${baseUrl}/api/public/events`);
  assert.notEqual(response.status, 503);
});
