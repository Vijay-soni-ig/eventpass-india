import assert from "node:assert/strict";
import test from "node:test";
import { getNotificationTemplate, renderNotificationTemplate, NOTIFICATION_TEMPLATES } from "../src/lib/notificationTemplates";

const FOLLOWER_EVENTS = [
  "EVENT_PUBLISHED",
  "EVENT_UPDATED",
  "EVENT_DATE_CHANGED",
  "EVENT_TICKETS_AVAILABLE",
  "ORGANIZER_PROFILE_UPDATED",
] as const;

test("notification template registry contains every foundation event", () => {
  assert.deepEqual(Object.keys(NOTIFICATION_TEMPLATES).sort(), [
    ...FOLLOWER_EVENTS,
    "STALL_RESERVATION_EXPIRED",
  ].sort());

  for (const eventType of FOLLOWER_EVENTS) {
    const template = getNotificationTemplate(eventType);
    assert.ok(template);
    assert.equal(template.version, 1);
    assert.deepEqual(template.channels, ["IN_APP", "EMAIL", "PUSH"]);
  }

  const stallTemplate = getNotificationTemplate("STALL_RESERVATION_EXPIRED");
  assert.ok(stallTemplate);
  assert.equal(stallTemplate.key, "stall-reservation-expired");
  assert.deepEqual(stallTemplate.channels, ["IN_APP", "EMAIL"]);
});

test("follower templates render caller-provided content without requiring provider details", () => {
  for (const eventType of FOLLOWER_EVENTS) {
    const rendered = renderNotificationTemplate({
      eventType,
      entityId: "exhibition-1",
      payload: {
        title: "Test notification",
        message: "Test message",
        actionUrl: "/exhibition/exhibition-1",
      },
    });
    assert.ok(rendered);
    assert.equal(rendered.content.title, "Test notification");
    assert.equal(rendered.content.body, "Test message");
    assert.equal(rendered.content.actionUrl, "/exhibition/exhibition-1");
  }
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

test("action URL rendering rejects open-redirect and script-executing URLs, falling back to a safe default", () => {
  const unsafeUrls = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.example.com/phish",
    "https://evil.example.com",
    "http://evil.example.com",
  ];
  for (const actionUrl of unsafeUrls) {
    const rendered = renderNotificationTemplate({
      eventType: "EVENT_PUBLISHED",
      entityId: "exhibition-1",
      payload: { title: "t", message: "m", actionUrl },
    });
    assert.ok(rendered);
    assert.equal(rendered.content.actionUrl, "/notifications", `unsafe actionUrl must be rejected: ${actionUrl}`);
  }

  // A genuine root-relative internal path must still pass through untouched.
  const safe = renderNotificationTemplate({
    eventType: "EVENT_PUBLISHED",
    entityId: "exhibition-1",
    payload: { title: "t", message: "m", actionUrl: "/exhibition/exhibition-1" },
  });
  assert.ok(safe);
  assert.equal(safe.content.actionUrl, "/exhibition/exhibition-1");
});


it("renders registration lifecycle templates", () => {
  for (const type of ["REGISTRATION_SUBMITTED", "REGISTRATION_CONFIRMED", "REGISTRATION_CANCELLED"]) {
    const rendered = renderNotificationTemplate({
      eventType: type,
      entityId: "registration-1",
      payload: { eventTitle: "Example Expo", actionUrl: "/events/event-1" },
    });
    expect(rendered).not.toBeNull();
    expect(rendered?.template.channels).toEqual(["IN_APP", "EMAIL", "PUSH"]);
  }
});
