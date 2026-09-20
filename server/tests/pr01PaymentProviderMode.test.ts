import { test } from "node:test";
import assert from "node:assert/strict";
import { getPaymentProvider, resetPaymentProviderCache } from "../src/lib/payments";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    resetPaymentProviderCache();
    fn();
  } finally {
    resetPaymentProviderCache();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production refuses the mock payment provider", () => {
  withEnv(
    { NODE_ENV: "production", PAYMENT_PROVIDER: "mock" },
    () => {
      assert.throws(
        () => getPaymentProvider(),
        /PAYMENT_PROVIDER=mock is not allowed in production/
      );
    }
  );
});

test("non-production may explicitly use the mock payment provider", () => {
  withEnv(
    { NODE_ENV: "test", PAYMENT_PROVIDER: "mock" },
    () => {
      assert.equal(getPaymentProvider().name, "mock");
    }
  );
});
