import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatExhibitorCurrency,
  getExhibitorProfileCompletion,
  normalizeLeadCaptureStallId,
} from "../../src/lib/exhibitorProfile";

test("profile completion uses the same required fields across dashboard and profile", () => {
  assert.equal(getExhibitorProfileCompletion(null), 0);
  assert.equal(getExhibitorProfileCompletion({ companyName: "Acme", address: "", logoUrl: null }), 33);
  assert.equal(getExhibitorProfileCompletion({ companyName: "Acme", address: "Ahmedabad", logoUrl: "logo.png" }), 100);
});

test("GST and PAN are not prerequisites for initial profile completion", () => {
  assert.equal(getExhibitorProfileCompletion({ companyName: "Acme", address: "Ahmedabad", logoUrl: "logo.png" }), 100);
});

test("stall sentinel none is omitted from lead capture payloads", () => {
  assert.equal(normalizeLeadCaptureStallId("none"), undefined);
  assert.equal(normalizeLeadCaptureStallId("  none  "), undefined);
  assert.equal(normalizeLeadCaptureStallId("stall-123"), "stall-123");
});

test("currency formatting preserves small INR amounts instead of rounding them to ₹0.0L", () => {
  assert.equal(formatExhibitorCurrency(0), "₹0");
  assert.equal(formatExhibitorCurrency(12500), "₹12,500");
  assert.equal(formatExhibitorCurrency(125000), "₹1,25,000");
  assert.equal(formatExhibitorCurrency(Number.NaN), "₹0");
});
