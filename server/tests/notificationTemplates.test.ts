import assert from "node:assert/strict";
import test from "node:test";
import { getNotificationTemplate, renderNotificationTemplate } from "../src/lib/notificationTemplates";

test("notification template registry returns versioned stall-expiry template", () => {
  const template = getNotificationTemplate("STALL_RESERVATION_EXPIRED");
  assert.ok(template);
  assert.equal(template.key, "stall-reservation-expired");
  assert.equal(template.version, 1);
  assert.deepEqual(template.channels, ["IN_APP", "EMAIL"]);
});

test("stall-expiry template renders safe payload fallback and dynamic stall label", () => {
  const rendered = renderNotificationTemplate({
    eventType: "STALL_RESERVATION_EXPIRED",
    entityId: "participation-1",
    payload: { stallLabel: "A-12" },
  });
  assert.ok(rendered);
  assert.match(rendered.content.body, /A-12/);
  assert.equal(rendered.content.actionUrl, "/exhibitor-dashboard/participations");
});

test("unknown notification event has no template", () => {
  assert.equal(getNotificationTemplate("UNKNOWN_EVENT"), null);
});
