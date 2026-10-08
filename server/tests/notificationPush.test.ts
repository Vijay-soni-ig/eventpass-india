import assert from "node:assert/strict";
import test from "node:test";
import { sendPush } from "../src/lib/notificationProviders";

test("sendPush fails closed when VAPID configuration is missing", async () => {
  const previousSubject = process.env.VAPID_SUBJECT;
  const previousPublic = process.env.VAPID_PUBLIC_KEY;
  const previousPrivate = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;

  try {
    const result = await sendPush({
      recipientUserId: "test-user",
      content: { title: "Test", body: "Test body", actionUrl: "/notifications" },
      attempts: 1,
    });
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /not configured/i);
  } finally {
    if (previousSubject === undefined) delete process.env.VAPID_SUBJECT;
    else process.env.VAPID_SUBJECT = previousSubject;
    if (previousPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previousPublic;
    if (previousPrivate === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = previousPrivate;
  }
});
