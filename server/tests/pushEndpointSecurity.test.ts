import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedPushEndpoint } from "../src/lib/pushEndpoint";

test("allows supported browser push service endpoints", () => {
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/example"), true);
  assert.equal(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example"), true);
  assert.equal(isAllowedPushEndpoint("https://web.push.apple.com/example"), true);
});

test("rejects arbitrary HTTPS endpoints that could enable server-side request forgery", () => {
  assert.equal(isAllowedPushEndpoint("https://example.com/push"), false);
  assert.equal(isAllowedPushEndpoint("https://localhost/push"), false);
  assert.equal(isAllowedPushEndpoint("https://127.0.0.1/push"), false);
  assert.equal(isAllowedPushEndpoint("https://192.168.1.10/push"), false);
});

test("rejects push-service lookalikes, credentials, non-HTTPS URLs, and custom ports", () => {
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com.attacker.example/push"), false);
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com@127.0.0.1/push"), false);
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/push"), false);
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/push"), false);
  assert.equal(isAllowedPushEndpoint("not a URL"), false);
});
