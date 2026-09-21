import assert from "node:assert/strict";
import test from "node:test";
import { getNotificationEvent, NOTIFICATION_EVENTS } from "../src/lib/notificationEventRegistry";

const FOUNDATION_EVENTS = [
  "EVENT_PUBLISHED",
  "EVENT_UPDATED",
  "EVENT_DATE_CHANGED",
  "EVENT_TICKETS_AVAILABLE",
  "ORGANIZER_PROFILE_UPDATED",
  "STALL_RESERVATION_EXPIRED",
  "REGISTRATION_SUBMITTED",
  "REGISTRATION_CONFIRMED",
  "REGISTRATION_CANCELLED",
] as const;

test("notification event registry covers every foundation event", () => {
  assert.deepEqual(Object.keys(NOTIFICATION_EVENTS).sort(), [...FOUNDATION_EVENTS].sort());
  for (const eventType of FOUNDATION_EVENTS) {
    const definition = getNotificationEvent(eventType);
    assert.ok(definition);
    assert.equal(definition.eventType, eventType);
    assert.equal(typeof definition.resolveRecipients, "function");
  }
});

test("unknown notification event is rejected by the registry", () => {
  assert.equal(getNotificationEvent("UNKNOWN_EVENT"), null);
});

test("registration lifecycle notification events are registered", () => {
  assert.ok(getNotificationEvent("REGISTRATION_SUBMITTED"));
  assert.ok(getNotificationEvent("REGISTRATION_CONFIRMED"));
  assert.ok(getNotificationEvent("REGISTRATION_CANCELLED"));
});
