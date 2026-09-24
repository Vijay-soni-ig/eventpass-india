import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  process.env.PAYMENT_PROVIDER = "mock";
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

test("payment webhook rejects an invalid signature before parsing or mutation", async () => {
  const response = await fetch(`${baseUrl}/api/webhooks/payments/mock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mock-Signature": "invalid-signature",
    },
    body: JSON.stringify({
      event: "payment.captured",
      payload: { payment_id: "forged-payment" },
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid webhook signature" });
});
