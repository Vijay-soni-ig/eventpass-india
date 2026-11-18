import { test } from "node:test";
import assert from "node:assert/strict";
import { getNotificationWorkerConfig } from "../src/lib/notificationWorkerConfig";

const baseEnv: NodeJS.ProcessEnv = {
  NOTIFICATION_DISPATCHER_ENABLED: "true",
  DATABASE_URL: "postgresql://worker:worker@localhost:5432/exhibittix",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "ExhibitTix Staging <notifications@example.test>",
};

test("notification worker refuses to start unless explicitly enabled", () => {
  assert.throws(
    () => getNotificationWorkerConfig({ ...baseEnv, NOTIFICATION_DISPATCHER_ENABLED: "false" }),
    /NOTIFICATION_DISPATCHER_ENABLED=true/,
  );
});

test("notification worker requires database and real email provider configuration", () => {
  assert.throws(() => getNotificationWorkerConfig({ ...baseEnv, DATABASE_URL: "" }), /DATABASE_URL is required/);
  assert.throws(() => getNotificationWorkerConfig({ ...baseEnv, RESEND_API_KEY: "" }), /RESEND_API_KEY and EMAIL_FROM are required/);
  assert.throws(() => getNotificationWorkerConfig({ ...baseEnv, EMAIL_FROM: "" }), /RESEND_API_KEY and EMAIL_FROM are required/);
});

test("notification worker uses a safe default interval and clamps configured values", () => {
  assert.equal(getNotificationWorkerConfig(baseEnv).intervalMs, 15_000);
  assert.equal(getNotificationWorkerConfig({ ...baseEnv, NOTIFICATION_DISPATCHER_INTERVAL_MS: "2500" }).intervalMs, 2500);
  assert.equal(getNotificationWorkerConfig({ ...baseEnv, NOTIFICATION_DISPATCHER_INTERVAL_MS: "100" }).intervalMs, 1000);
  assert.equal(getNotificationWorkerConfig({ ...baseEnv, NOTIFICATION_DISPATCHER_INTERVAL_MS: "999999" }).intervalMs, 60_000);
});
