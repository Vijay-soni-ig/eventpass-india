#!/usr/bin/env node

const provider = (process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();

const required = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
const missing = required.filter((name) => !(process.env[name] || "").trim());

if (provider === "mock") {
  if (nodeEnv === "production") {
    console.error(JSON.stringify({
      ok: false,
      error: "PAYMENT_PROVIDER=mock is not allowed in production",
    }));
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    provider: "mock",
    environment: nodeEnv,
    externalVerification: "not_applicable",
  }));
  process.exit(0);
}

if (provider !== "razorpay") {
  console.error(JSON.stringify({
    ok: false,
    error: "Set PAYMENT_PROVIDER=razorpay for Razorpay verification",
    provider: provider || null,
  }));
  process.exit(1);
}

if (missing.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    provider: "razorpay",
    error: "Razorpay credentials are incomplete",
    missing,
  }));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  provider: "razorpay",
  environment: nodeEnv,
  credentials: "present",
  networkVerification: "not_performed",
  note: "This contract check never prints credential values or calls the Razorpay API.",
}));
