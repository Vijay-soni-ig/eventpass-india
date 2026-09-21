import { test } from "node:test";
import assert from "node:assert/strict";
import { assertProductionPaymentConfig, getPaymentProvider, resetPaymentProviderCache } from "../src/lib/payments";

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

test("production rejects mock or unset payment provider before checkout is reached", () => {
  withEnv({ NODE_ENV: "production", PAYMENT_PROVIDER: "mock" }, () => {
    assert.throws(
      () => assertProductionPaymentConfig(),
      /Production payments require PAYMENT_PROVIDER=razorpay/
    );
  });

  withEnv({ NODE_ENV: "production", PAYMENT_PROVIDER: undefined }, () => {
    assert.throws(
      () => assertProductionPaymentConfig(),
      /Production payments require PAYMENT_PROVIDER=razorpay/
    );
  });
});

test("production rejects incomplete Razorpay configuration at startup", () => {
  withEnv(
    {
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "razorpay",
      RAZORPAY_KEY_ID: "rzp_test_id",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
    },
    () => {
      assert.throws(
        () => assertProductionPaymentConfig(),
        /Production Razorpay configuration is incomplete. Missing: RAZORPAY_KEY_SECRET/
      );
    }
  );
});

test("production accepts complete Razorpay configuration", () => {
  withEnv(
    {
      NODE_ENV: "production",
      PAYMENT_PROVIDER: "razorpay",
      RAZORPAY_KEY_ID: "rzp_test_id",
      RAZORPAY_KEY_SECRET: "test-secret",
      RAZORPAY_WEBHOOK_SECRET: "webhook-secret",
    },
    () => {
      assert.doesNotThrow(() => assertProductionPaymentConfig());
    }
  );
});
